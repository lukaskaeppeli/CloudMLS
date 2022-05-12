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

import { axiosClient, CloudMLS } from './index';
import { base64ToBytes, bytesToBase64 } from 'byte-base64';
import { MLSservice } from './mls-wrapper';
import { MLS } from './types';
import { KeyServer } from './keyserver';
import { Delivery } from './delivery';


type Account = {
  platform: string,
  account_id: string,
  keypackage: string
}

export namespace AccountManager {

  export let accounts: Account[] = []

  export function destroy() {
    accounts = []
  }

  /**
   * Sets the accounts of the currently logged in user
   * 
   * @param new_accounts having the format: JSON.stringify([[account_id, keypackage], ...])
   */
  export async function setAccounts(new_accounts: Account[]): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!new_accounts) {
        return resolve()// No accounts, no problems
      } else {
        accounts = new_accounts

        // Update all keypackages and fetch messages
        let promises = []
        for (let account of accounts) {
          promises.push(updateKeyPackage(account))
          promises.push(Delivery.fetchMessages(account.platform, account.account_id))
        }

        Promise.all(promises).then(() => { return resolve() }).catch(error => { return reject(error) })
      }
    })
  }

  export async function addAccount(platform: string, account_id: string): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!account_id) {
        return reject(new Error("Account id undefined"))
      }

      for (let account of accounts) {
        if (account.platform == platform && account.account_id == account_id) {
          // Don't add the same account twice, but its ok to try
          return reject(new Error("Account already registered"))
        }
      }

      axiosClient.post(CloudMLS.servers.auth_server_url + "/account", { platform: platform, account_id: account_id })
        .then(
          () => {
            updateKeyPackage({ platform: platform, account_id: account_id, keypackage: "" }).then(
              () => {
                return resolve()
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
   * Updates the keypackage for the specified account if there is none yet or
   * it will expire in less than 7 days.
   * 
   * @param account for which the keypackage has to be updated
   * @param forced If set to true, the keypackage is updated even if not expiring soon
   * @returns A promise resolving to void or an error is rejected
   */
  export async function updateKeyPackage(account: Account, forced?: boolean): Promise<void> {
    return new Promise((resolve, reject) => {
      // Check if keypackage exists and if so is expiring soon (7 days)
      if (account.keypackage != "" && !forced) {
        MLSservice.isKeyPackageValid(base64ToBytes(account.keypackage), (1000 * 3600 * 24 * 7)).then(
          valid => {
            if (valid) {
              return resolve()
            } else {
              createKeyPackage(account).then(() => { return resolve() })
            }
          }
        )
      } else {
        createKeyPackage(account).then(() => { return resolve() })
      }
    })
  }


  /**
   * Creates a new keypackage for the specified account, issues update commits to
   * each group in which the specified account is a member and posts the new keypackage
   * to the keyserver
   * 
   * @param account for which the keypackage should be created
   * @returns A promise resolving to void or an error is rejected
   */
  async function createKeyPackage(account: Account): Promise<void> {
    return new Promise((resolve, reject) => {

      MLSservice.createKeyPackage(account.account_id)
        .then(async keyPackageData => {
          let groups = await KeyServer.getGroups(account.platform, account.account_id)
          for (let group of groups) {
            let groupState = await KeyServer.getGroupState(account.platform, account.account_id, group)
            let [commitMessage, updatedGroupState,] = await MLSservice.commitUpdate(groupState, keyPackageData)

            for (let member of groupState.members) {
              Delivery.storeMlsMessage(
                account.account_id,
                member,
                account.platform,
                group,
                MLS.MessageType.COMMIT,
                bytesToBase64(commitMessage),
                groupState.creationTime
              )
            }

            await KeyServer.postGroupState(account.account_id, account.platform, updatedGroupState)
              .then(async _ => Delivery.sendAll())
              .catch(error => {
                Delivery.destroy()
                return reject(error)
              })
          }

          KeyServer.updateKeyPackage(account.platform, account.account_id, keyPackageData, account.keypackage).then(
            () => {
              account.keypackage = bytesToBase64(keyPackageData.keypackage)
              return resolve()
            },
            error => {
              return reject(error)
            })
        })
    })
  }

}
