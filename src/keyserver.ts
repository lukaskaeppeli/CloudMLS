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
import { AES, enc } from 'crypto-js';
import { axiosClient, CloudMLS } from '..';
import { KeyServer as KeyServer_Types, MLS } from './types';


export namespace KeyServer {

  /**
   * Request a specific keypackage
   * 
   * @param platform platform for which the keypackage is created
   * @param account_id account ID of user on specified platform
   * @returns keypackage or undefined if none
   */
  export async function getKeyPackage(platform: string, account_id: string): Promise<Uint8Array> {
    return new Promise((resolve, reject) => {
      axiosClient.get(CloudMLS.servers.auth_server_url + "/keypackage/" + platform + "/" + account_id)
        .then(result => {
          if (result.data["response"] == "") {
            return resolve(undefined)
          } else {
            return resolve(base64ToBytes(result.data["response"]))
          }
        })
        .catch(error => {
          if (error.response.status != 404) console.error(error)

          return resolve(undefined)
        })
    })
  }


  /**
   * Request keypackage data. This data is stored as JSON.stringify(PackageData) on the
   * keyserver and has therefore to be parsed before returned.
   * 
   * @param platform platform for which the keypackage is created
   * @param account_id account ID of user on specified platform
   * @returns keypackage data or undefined if none
   */
  export async function getKeyPackageData(platform: string, account_id: string): Promise<MLS.PackageData> {
    return new Promise((resolve, reject) => {
      axiosClient.get(CloudMLS.servers.key_server_url + "/keypackagedata/" + platform + "/" + account_id)
        .then((result) => {
          let encKey = CloudMLS.keystore.get_encryption_key()
          if (!encKey) {
            return reject("Failed to load encryption key")
          }

          let decrypted = AES.decrypt(result.data["response"] as string, encKey).toString(enc.Utf8)
          let ksPackageData = JSON.parse(decrypted)
          let deSerializedData = {}
          Object.keys(ksPackageData).forEach(key => deSerializedData[key] = base64ToBytes(ksPackageData[key]))
          return resolve(deSerializedData as MLS.PackageData)
        })
        .catch(error => {
          return reject(error)
        })
    })
  }


  /**
   * Updates a keypackage on the authentication server and stores the corresponding
   * keypackage data on the keyserver
   * 
   * @param platform platform name, e.g. Telegram
   * @param account_id platform specific identifier
   */
  export async function updateKeyPackage(platform: string, account_id: string, keyPackageData: MLS.PackageData, old_keypackage?: string): Promise<void> {
    return new Promise((resolve, reject) => {
      let serializedData = {}
      Object.keys(keyPackageData).forEach(key => serializedData[key] = bytesToBase64(keyPackageData[key]))

      let encKey = CloudMLS.keystore.get_encryption_key()
      if (!encKey) {
        return reject(new Error("Failed to load encryption key"))
      }

      let encKeypackageData = AES.encrypt(JSON.stringify(serializedData), encKey).toString()

      let postobject = {
        platform: platform,
        account_id: account_id,
        keypackage: (serializedData as KeyServer_Types.PackageData).keypackage,
        keypackageData: encKeypackageData,
        oldKeypackage: old_keypackage
      }

      axiosClient.post(CloudMLS.servers.key_server_url + "/keypackage", postobject)
        .then(result => {
          // TODO: If has custom keyserver, need to post it there too
          return resolve()
        })
        .catch(error => {
          return reject(error)
        })
    })
  }

  /**
   * Requests all groups of the specified platform in which the specified account is
   * a member
   * 
   * @param platform on which the groups are
   * @param account_id my account identifier on that platform
   * @returns a list of group_ids
   */
  export async function getGroups(platform: string, account_id: string): Promise<string[]> {
    return new Promise((resolve, reject) => {
      axiosClient.get(CloudMLS.servers.key_server_url + "/groups/" + platform + "/" + account_id)
        .then(result => {
          return resolve(result.data["response"].groups)
        })
    })
  }

  /**
   * Requests a specific group state from the keyserver
   * 
   * @param platform on which the group is
   * @param account_id my account identifier on that platform
   * @param group_id the platform specific group identifier
   * @returns A Promise which resolves either to KS_GroupState or undefined. Never rejects. 
   */
  export async function getGroupState(platform: string, account_id: string, group_id: string): Promise<KeyServer_Types.GroupState> {
    return new Promise((resolve, reject) => {
      axiosClient.get(CloudMLS.servers.key_server_url + "/groups/" + platform + "/" + account_id + "/" + group_id)
        .then(result => {
          let response = result.data["response"]

          let encKey = CloudMLS.keystore.get_encryption_key()
          if (!encKey) {
            console.error("Failed to load encryption key")
            return resolve(undefined)
          }

          let members = JSON.parse(AES.decrypt(response["members"] as string, encKey).toString(enc.Utf8))
          let creationTime = +JSON.parse(AES.decrypt(response["creationTime"] as string, encKey).toString(enc.Utf8))
          let mlsGroup = new Map<number, string>(JSON.parse(AES.decrypt(response["mlsGroup"] as string, encKey).toString(enc.Utf8)))
          let latestEpoch = +JSON.parse(AES.decrypt(response["latestEpoch"] as string, encKey).toString(enc.Utf8))

          return resolve({
            group_id: response["group_id"],
            members: new Set(members),
            creationTime: creationTime,
            mlsEpochState: mlsGroup,
            updateCounter: response["updateCounter"],
            latestEpoch: latestEpoch
          })
        })
        .catch(error => {
          // Don't display 404
          if (error.response?.status != 404) console.error(error)

          return resolve(undefined)
        })
    })
  }

  /**
   * The groupState.mlsEpochState data structure grows over time. Using this method
   * old states are removed 
   * 
   * @param account_id my account identifier on that platform
   * @param platform on which the group is
   * @param group_id for which the old states have to be removed
   * @param epoch latest epoch to remove the state for
   * @returns A Promise which resolves void or an error is rejected
   */
  export  async function removeOldStates(account_id: string, platform: string, group_id: string, epoch: number): Promise<void> {
    return new Promise((resolve, reject) => {
      getGroupState(platform, account_id, group_id)
        .then(groupState => {
          const oldKeys = Array.from(groupState.mlsEpochState.keys()).filter(key => key <= epoch)
          oldKeys.forEach(key => groupState.mlsEpochState.delete(key))
          postGroupState(account_id, platform, groupState)
            .then(() => { return resolve() })
        })
    })
  }

  /**
   * Posts the complete group state to the keyserver. No delta updates but complete replacement
   * 
   * @param account_id my account identifier on that platform
   * @param platform on which the group is
   * @param groupState to be posted
   * @returns A Promise which resolves void or an error is rejected
   */
  export async function postGroupState(account_id: string, platform: string, groupState: KeyServer_Types.GroupState): Promise<void> {
    return new Promise((resolve, reject) => {
      let encKey = CloudMLS.keystore.get_encryption_key()
      if (!encKey) {
        return reject(new Error("Failed to load encryption key"))
      }

      groupState.mlsEpochState.forEach((value, key) => {
        if (key != JSON.parse(value).epoch) {
          return reject(new Error("Trying to upload non consistent mlsEpochState. Better correct now than regretting later..."))
        }
      })

      let encMembers = AES.encrypt(JSON.stringify(Array.from(groupState.members)), encKey).toString()
      let encCreationTime = AES.encrypt(JSON.stringify(groupState.creationTime), encKey).toString()
      let encMlsGroup = AES.encrypt(JSON.stringify(Array.from(groupState.mlsEpochState.entries())), encKey).toString()
      let encLatestEpoch = AES.encrypt(JSON.stringify(groupState.latestEpoch), encKey).toString()

      let postobject = {
        platform: platform,
        account_id: account_id,
        group_id: groupState.group_id,
        updateCounter: groupState.updateCounter + 1,
        members: encMembers,
        creationTime: encCreationTime,
        mlsGroup: encMlsGroup,
        latestEpoch: encLatestEpoch
      }

      axiosClient.post(CloudMLS.servers.key_server_url + "/groups", postobject)
        .then(() => { return resolve() })
        .catch(error => { return reject(error) })


    })
  }

}