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

import { KeyServer } from './keyserver';
import { MLSservice } from './mls-wrapper';

export namespace Message {


  /**
   * Encrypts a message using the MLS data structure of the specified group. Therefore, 
   * the group state is fetched from the keyserver, used to encrypt the specified message.
   * The resulting group state is afterwards serialized and stored on the keyserver again.
   * 
   * If there is no group state on the keyserver, the message plaintext is returned.
   * 
   * @param plaintext to be encrypted
   * @param platform on which the message will be sent
   * @param account_id of the sender
   * @param group_id of the group in which the message will be sent
   * @returns A pair, where the first element is the (possibly) encrypted message and the
   *          second element is a boolean indicating if the encryption was successful
   */
  export async function encrypt(plaintext: string, platform: string, account_id: string, group_id: string): Promise<[string, boolean]> {
    return new Promise((resolve, reject) => {
      KeyServer.getKeyPackageData(platform, account_id).then(
        async keyPackageData => {
          let groupState = await KeyServer.getGroupState(platform, account_id, group_id)

          // Group is not encrypted, return plaintext
          if (!groupState) {
            return resolve([plaintext, false])
          }

          let [msg, updatedGroupState] = await MLSservice.encryptMessage(groupState, plaintext, keyPackageData);

          KeyServer.postGroupState(account_id, platform, updatedGroupState).then(
            () => {
              return resolve([msg, true])
            },

            error => {
              return reject(error)
            }
          )

        },

        error => {
          return reject(error)
        }
      )
    })

  }

  /**
   * Decrypts a message using the MLS data structure of the specified group. Therefore, 
   * the group state is fetched from the keyserver, used to decrypt the specified message.
   * The resulting group state is afterwards serialized and stored on the keyserver again,
   * if the decryption changed the datastructure.
   * 
   * @param ciphertext to be decrypted
   * @param date when the message was sent
   * @param platform on which the message is received
   * @param account_id of the receiver
   * @param group_id of the group in which the message is received
   * @returns A pair, where the first element is the (possibly) decrypted message and the
   *          second element is a boolean indicating if the decryption was successful
   */
  export async function decrypt(ciphertext: string, date: number, platform: string, account_id: string, group_id: string): Promise<[string, boolean]> {
    return new Promise((resolve, reject) => {
      KeyServer.getGroupState(platform, account_id, group_id)
        .then(groupState => {
          if (!groupState || groupState.creationTime >= date) {
            return resolve([ciphertext, false])
          }

          MLSservice.decryptMessage(groupState, ciphertext)
            .then(([encrypted, plaintext, updatedGroupState]) => {
              KeyServer.postGroupState(account_id, platform, updatedGroupState)
                .then(() => { return resolve([plaintext, encrypted]) })
            })
            .catch(error => {
              console.error(error)
              return resolve([ciphertext, false])
            })
        })
        .catch(error => {
          console.error(error)
          return resolve([ciphertext, false])
        })
    })
  }

}
