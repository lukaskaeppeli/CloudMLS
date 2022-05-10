/*
Copyright 2022 Lukas Käppeli

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

  http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/

import { base64ToBytes, bytesToBase64 } from 'byte-base64';
import { cipherSuiteById } from './mls-ts/src/ciphersuite';
import { EMPTY_BYTE_ARRAY, ExtensionType, ProtocolVersion } from './mls-ts/src/constants';
import { BasicCredential, Credential } from './mls-ts/src/credential';
import { Group } from './mls-ts/src/group';
import { KEMPrivateKey } from './mls-ts/src/hpke/base';
import { KeyPackage, Lifetime } from './mls-ts/src/keypackage';
import { Add, MLSCiphertext, MLSPlaintext, Proposal, ProposalWrapper, Remove, Update } from './mls-ts/src/message';
import { RatchetTreeView } from './mls-ts/src/ratchettree';
import * as tlspl from "./mls-ts/src/tlspl";
import { stringToUint8Array } from './mls-ts/src/util';
import { Welcome } from './mls-ts/src/welcome';
import { Delivery, KeyServer, MLS } from './types';

export namespace MLSservice {

  /**
   * Interface for keypackages and its associated keys.
   * See Chapters 6 and 7.
   */

  export const protocolVersion: ProtocolVersion = ProtocolVersion.Mls10

  /**
   * Decodes the keypackage and checks its signature. If the signature is valid,
   * the Lifetime extension is checked and true is resolved, if the package is
   * still valid
   * 
   * @param keypackage_bytes KeyPackage that must contain an Extension of type Lifetime
   * @param future_time time in milliseconds from now on
   * @returns A promise that gets resolved to true for all valid keypackages and false
   *          for non-valid keypackages. Never rejects.
   */
  export async function isKeyPackageValid(keypackage_bytes: Uint8Array, future_time?: number): Promise<Boolean> {
    return new Promise((resolve, reject) => {
      const [keypackage, _] = KeyPackage.decode(keypackage_bytes, 0)
      keypackage.checkSignature().then(
        valid => {
          if (valid) {
            for (let extension of keypackage.extensions) {
              if (extension.extensionType == ExtensionType.Lifetime) {
                if ((extension as Lifetime).is_valid(future_time)) {
                  return resolve(true)
                } else {
                  return resolve(false)
                }
              }
            }

            return resolve(false)
          }
          else {
            return resolve(false)
          }
        },

        error => {
          console.error(error);
          return resolve(false)
        }
      )
    })
  }

  /**
   * Creates a KeyPackage as specified in Chapter 7. The default validity
   * period is 30 days (1000 * 3600 * 24 * 30 milliseconds) from now on.
   * 
   * @param unique_user_id with which user the KeyPackage is associated. 
   * @returns Promise of PackageData for the new keypackage
   */
  export async function createKeyPackage(unique_user_id: string): Promise<MLS.PackageData> {
    const cipherSuite = cipherSuiteById[1]
    const [signingPrivKey, signingPubKey] = await cipherSuite.signatureScheme.generateKeyPair();
    const [hpkePrivKey, hpkePubKey] = await cipherSuite.hpke.kem.generateKeyPair();

    let credential = new BasicCredential(
      stringToUint8Array(unique_user_id.toString()),
      cipherSuite.signatureSchemeId,
      await signingPubKey.serialize(),
    );

    // Create Lifetime Extension with 30 days validity, starting from now
    const now = new Date().getTime()
    const valid_until = now + (1000 * 3600 * 24 * 30)
    const lifetime = new Lifetime(now, valid_until)

    const keyPackage = await KeyPackage.create(
      protocolVersion,
      cipherSuite,
      await hpkePubKey.serialize(),
      credential,
      [lifetime],
      signingPrivKey,
    );

    return {
      keypackage: tlspl.encode([keyPackage.encoder]),
      signingPrivateKey: await signingPrivKey.serialize(),
      signingPublicKey: await signingPubKey.serialize(),
      hpkePrivateKey: await hpkePrivKey.serialize(),
      hpkePublicKey: await hpkePubKey.serialize(),
      credential: tlspl.encode([credential.encoder])
    }
  }

  /**
   * Returns the leaf number of the specifed user in the provided tree
   * 
   * @param user_uuid of the user whose leaf number is requested
   * @param tree where the leaf number has to be resolved
   * @returns 
   */
  function getTreeIndex(user_uuid: string, tree: RatchetTreeView): number {
    return tree.idToLeafNum.get(stringToUint8Array(user_uuid).toString())
  }

  /**
   * Creates a new MLS group
   * 
   * @param group_id id of the new group
   * @param keypackage_buffers keypackages of all members of the group except the one of the group creator
   * @param my_keypackage keypackage of the group creator
   * @returns A Promise of [serializedGroup: string, unnecessary mlsPlaintext: MLSPlaintext, Welcome message buffer: Uint8Array]
   */
  export async function createGroup(group_id: string, keypackage_buffers: Uint8Array[], my_keypackage: MLS.PackageData): Promise<[string, MLSPlaintext, Uint8Array]> {
    return new Promise((resolve, reject) => {
      try {
        let credential: Credential = Credential.decode(my_keypackage["credential"], 0)[0]
        let keypackages = keypackage_buffers.map(buffer => KeyPackage.decode(buffer, 0)[0])

        const cipherSuite = cipherSuiteById[1]

        cipherSuite.signatureScheme.deserializePrivate(my_keypackage.signingPrivateKey)
          .then(signingPrivateKey => Group.createNew(
            protocolVersion,
            cipherSuite,
            stringToUint8Array(group_id.toString()),
            credential,
            signingPrivateKey,
            keypackages
          ))
          .then(([group, mls_plaintext, welcome]) => {
            console.log(`MlsService: createGroup: Created Group ${group_id} successfully`)

            let welcomeBuffer = new Uint8Array(welcome.encoder.length)
            welcome.encoder.writeToBuffer(welcomeBuffer, 0)

            group.serialize().then(serializedGroup => {
              return resolve([serializedGroup, mls_plaintext, welcomeBuffer])
            })
          })
      } catch (error) {
        return reject(error)
      }
    })
  }

  /**
   * When a user updates its keypackage, this method creates the proposals
   * to the other group members
   * 
   * @param groupState of the group to which the update is commited
   * @param newKeyPackageData the new key package data
   * @returns A Promise for [commitMessage: Uint8Array, groupState after the update, welcomeMessage: Uint8Array]
   */
  export async function commitUpdate(
    groupState: KeyServer.GroupState,
    newKeyPackageData: MLS.PackageData
  ): Promise<[Uint8Array, KeyServer.GroupState, Uint8Array]> {
    return new Promise((resolve, reject) => {
      try {
        let updateLeafSecretProposal: Proposal
        let [keypackage,] = KeyPackage.decode(newKeyPackageData.keypackage, 0)
        Group.fromSerialized(groupState.mlsEpochState.get(groupState.latestEpoch))
          .then(group => group.cipherSuite.hpke.kem.deserializePrivate(newKeyPackageData.hpkePrivateKey))
          .then(kemPrivateKey => {
            updateLeafSecretProposal = new Update(keypackage, kemPrivateKey)
            commit(groupState, newKeyPackageData, [updateLeafSecretProposal])
              .then(result => { return resolve(result) })
          })
      } catch (error) {
        return reject(error)
      }
    })
  }

  /**
   * Generates Add and Remove proposals and directly calls commit() to return the corresponding
   * ciphertext containting the commit, as well as the welcome messages for new members. The commit
   * messages have to be sent to all group members and the welcome messages have to be sent to the 
   * new members
   * 
   * @param newKeyPackages keypackages of members that should be added to the group
   * @param leftMembers list of account identifiers of members that left the group (or were kicked)
   * @param groupState actual group state
   * @param my_keypackage keypackage of the caller
   * @returns A Promise for [commitMessage: Uint8Array, groupState after the update, welcomeMessage: Uint8Array]
   */
  export async function generateUpdateMessages(
    newKeyPackages: Uint8Array[],
    leftMembers: string[],
    groupState: KeyServer.GroupState,
    my_keypackage: MLS.PackageData
  ): Promise<[Uint8Array, KeyServer.GroupState, Uint8Array]> {
    return new Promise((resolve, reject) => {
      try {
        Group.fromSerialized(groupState.mlsEpochState.get(groupState.latestEpoch))
          .then(group => {
            let proposals: Proposal[] = []

            // Create add proposal for new users
            proposals.push(...newKeyPackages.map(keyPackage => {
              return new Add(KeyPackage.decode(keyPackage, 0)[0]) as Proposal
            }))

            // Check users that left
            for (let member of leftMembers) {
              proposals.push(new Remove(getTreeIndex(member, group.ratchetTreeView)))
            }

            commit(groupState, my_keypackage, proposals)
              .then(result => { return resolve(result) })
          })
      } catch (error) {
        return reject(error)
      }
    })
  }


  /**
   * Commit an array of proposals. Note that one should save all the epoch base ratchets before
   * calling this method, as commiting will result in a new epoch and all ratchets from the old
   * epoch will be lost.
   * 
   * @param groupState current groupState
   * @param my_keypackage keypackage of the caller
   * @param proposals array of update proposals
   * @returns A Promise for [commitMessage: Uint8Array, groupState after the update, welcomeMessage: Uint8Array]
   */
  async function commit(groupState: KeyServer.GroupState, my_keypackage: MLS.PackageData, proposals: Proposal[]): Promise<[Uint8Array, KeyServer.GroupState, Uint8Array]> {
    return new Promise((resolve, reject) => {
      try {

        let my_credential = Credential.decode(my_keypackage.credential, 0)[0]
        Group.fromSerialized(groupState.mlsEpochState.get(groupState.latestEpoch))
          .then(group => {
            group.cipherSuite.signatureScheme.deserializePrivate(my_keypackage.signingPrivateKey)
              .then(signingPrivateKey => group.commit(
                proposals.map(proposal => new ProposalWrapper(proposal)),
                my_credential,
                signingPrivateKey
              )
                .then(([mlsCiphertext, mlsPlaintext, welcome,]) => {
                  groupState.latestEpoch = group.epoch

                  group.serialize()
                    .then(serializedGroup => groupState.mlsEpochState.set(groupState.latestEpoch, serializedGroup))
                    .then(() => {
                      let mlsCiphertextBuffer = new Uint8Array(mlsCiphertext.encoder.length)
                      mlsCiphertext.encoder.writeToBuffer(mlsCiphertextBuffer, 0)

                      let welcomeBuffer: Uint8Array
                      if (welcome != undefined) {
                        welcomeBuffer = new Uint8Array(welcome.encoder.length)
                        welcome.encoder.writeToBuffer(welcomeBuffer, 0)
                      }

                      return resolve([mlsCiphertextBuffer, groupState, welcomeBuffer])
                    })
                })
              )
          })
      } catch (error) {
        return reject(error)
      }
    })
  }

  /**
   * Handles MLS specific messages received by the delivery service.
   * 
   * @param message received message
   * @param my_keypackage keypackage of the caller
   * @param groupState actual group state
   * @returns Promise of an updated groupState.
   */
  export async function handleMlsMessage(message: Delivery.Message, my_keypackage: MLS.PackageData, groupState: KeyServer.GroupState): Promise<KeyServer.GroupState> {
    return new Promise((resolve, reject) => {
      try {

        switch (message.message_type) {

          case MLS.MessageType.WELCOME: {
            if (groupState != undefined) {
              // Group already exists
              if (groupState.creationTime < message.creationTime) {
                // Existing group was created first. This happens when a new member installs Athena and
                // sends Welcome messages for all its chats. Remember to not create an add directly here
                // as this will be done later in GroupService

                console.log("Got invited to existing group, but doing nothing")
                return resolve(groupState)
              } else {
                // This happens, when a new member installs Athena and gets a Welcome to an existing group,
                // after having created one. Here we need to join the group

                console.log("Got invited to existing group, joining it")
              }

            }

            let welcome = Welcome.decode(base64ToBytes(message.mls_message), 0)[0];
            let keypackage = KeyPackage.decode(my_keypackage.keypackage, 0)[0];
            welcome.cipherSuite.hpke.kem.deserializePrivate(my_keypackage.hpkePrivateKey)
              .then(hpkePrivateKey => {
                let my_id = Uint8ArrayToString(keypackage.credential.identity)
                let my_record: Record<string, [KeyPackage, KEMPrivateKey]> = {}
                my_record[my_id] = [keypackage, hpkePrivateKey]

                Group.createFromWelcome(welcome, my_record)
                  .then(([keyId, group]) => {
                    console.log("Successfully joined group from WELCOME message")
                    
                    group.serialize().then(serializedGroup => {
                      return resolve({
                        group_id: Uint8ArrayToString(group.groupId),
                        members: new Set(group.ratchetTreeView.keyPackages
                          .filter(keypackage => keypackage != undefined)
                          .map(keypackage => Uint8ArrayToString(keypackage.credential.identity))),
                        creationTime: message.creationTime,
                        updateCounter: 0,
                        latestEpoch: group.epoch,
                        mlsEpochState: new Map<number, string>([[group.epoch, serializedGroup]])
                      })
                    })
                  })
              })
            break
          }
          case MLS.MessageType.COMMIT: {
            Group.fromSerialized(groupState.mlsEpochState.get(groupState.latestEpoch))
              .then(group => {
                group.decrypt(MLSCiphertext.decode(base64ToBytes(message.mls_message), 0)[0])
                  .then(commit => group.applyCommit(commit))
                  .catch(error => console.error(error))
                  .then(() => group.serialize())
                  .then(serializedGroup => {
                    groupState.mlsEpochState.set(group.epoch, serializedGroup)
                    groupState.latestEpoch = group.epoch
                    groupState.members = new Set(group.ratchetTreeView.keyPackages
                      .filter(keypackage => keypackage != undefined)
                      .map(keypackage => Uint8ArrayToString(keypackage.credential.identity)))

                    return resolve(groupState)
                  })
              })
          }
        }
      } catch (error) {
        return reject(error)
      }
    })
  }

  /**
   * Encrypts a message for the specified group
   * 
   * @param groupState for which the message should be encrypted
   * @param message to be encrypted
   * @param keyPackageData of the caller, needed to get the signing private key
   * @returns Promise to the tuple [ciphertext: string, updated group state: GroupState]
   */
  export async function encryptMessage(groupState: KeyServer.GroupState, message: string, keyPackageData: MLS.PackageData): Promise<[string, KeyServer.GroupState]> {
    return new Promise((resolve, reject) => {
      try {
        Group.fromSerialized(groupState.mlsEpochState.get(groupState.latestEpoch))
          .then(group => {
            group.cipherSuite.signatureScheme.deserializePrivate(keyPackageData.signingPrivateKey)
              .then(signingPrivateKey => {
                group.encrypt(stringToUint8Array(message), EMPTY_BYTE_ARRAY, signingPrivateKey)
                  .then(ctxt => {
                    let messageBuffer = new Uint8Array(ctxt.encoder.length);
                    ctxt.encoder.writeToBuffer(messageBuffer, 0);
                    let msg = bytesToBase64(messageBuffer);

                    group.serialize()
                      .then(serializedGroup => {
                        groupState.mlsEpochState.set(groupState.latestEpoch, serializedGroup)
                        return resolve([msg, groupState])
                      })
                  })
              })
          })
      } catch (error) {
        return reject(error)
      }
    })
  }

  /**
   * Decrypts a ciphertext using the provided group state
   * 
   * @param groupState for which the message was encrypted
   * @param message to be decrypted
   * @returns A Promise to the tuple [encrypted: boolean, plaintext: string, updated group state]. Never rejects.
   */
  export async function decryptMessage(groupState: KeyServer.GroupState, message: string): Promise<[boolean, string, KeyServer.GroupState]> {
    return new Promise((resolve, reject) => {
      let ciphertext = MLSCiphertext.decode(base64ToBytes(message), 0)[0]

      let epochState = groupState.mlsEpochState.get(ciphertext.epoch)
      if (!epochState) {
        return reject(new Error(`Should decrypt ciphertext for epoch ${ciphertext.epoch}, but no epoch state available`))
      }

      Group.fromSerialized(epochState)
        .then(group => {
          group.decrypt(ciphertext)
            .then(async plaintext => {
              groupState.mlsEpochState.set(ciphertext.epoch, await group.serialize())
              return resolve([
                true,
                Uint8ArrayToString(plaintext.content as Uint8Array),
                groupState
              ])
            })
            .catch(error => {
              console.error(error)
              return resolve([false, message, groupState]) // Unchanged
            })
        })
    })
  }

  function Uint8ArrayToString(u8: Uint8Array): string {
    return String.fromCharCode.apply(null, u8);
  }
}


