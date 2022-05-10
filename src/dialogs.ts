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

import { bytesToBase64 } from 'byte-base64';
import { Delivery } from './delivery';
import { KeyServer } from './keyserver';
import { MLSservice } from './mls-wrapper';
import { KeyServer as KeyServer_Types, MLS } from './types';


export namespace Dialogs {

  export async function update(platform: string, account_id: string, peer_id: string, group_id: string): Promise<boolean> {
    // Need to ensure that welcome messages are handled before we create a group
    await Delivery.fetchMessages(platform, account_id)

    return new Promise((resolve, reject) => {
      console.log(`#DialogService: checkDialogState: have dialog ${peer_id} on platform ${platform}`)

      KeyServer.getKeyPackageData(platform, account_id).then(
        async myKeypackageData => {
          let dialogState = await KeyServer.getGroupState(platform, account_id, group_id)

          // Check if peer members keypackages is valid
          let peerKeyPackage = await KeyServer.getKeyPackage(platform, peer_id)

          if (peerKeyPackage == undefined) {
            return resolve(false)
          }

          if (await MLSservice.isKeyPackageValid(peerKeyPackage)) {

            if (dialogState == undefined) {

              // Start MLS
              console.log(`#DialogService: checkDialogState: starting MLS`)
              MLSservice.createGroup(group_id, [peerKeyPackage], myKeypackageData).then(
                async ([serializedGroup, mlsplaintext, welcomeBuffer]) => {
                  let welcome = bytesToBase64(welcomeBuffer)

                  let creationTime = new Date().getTime()

                  Delivery.storeMlsMessage(account_id, peer_id, platform, group_id, MLS.MessageType.WELCOME, welcome, creationTime)

                  let newGroupState: KeyServer_Types.GroupState = {
                    group_id: group_id,
                    members: new Set([account_id, peer_id]),
                    creationTime: creationTime,
                    mlsEpochState: new Map<number, string>([[1, serializedGroup]]),
                    latestEpoch: 1,
                    updateCounter: 0,
                  }

                  KeyServer.postGroupState(account_id, platform, newGroupState).then(
                    () => {
                      Delivery.sendAll().then(
                        () => {
                          return resolve(true)
                        },
                        error => {
                          return reject(error)
                        }
                      )
                    },
                    error => {
                      Delivery.destroy()
                      return reject(error)
                    }
                  )
                },

                error => {
                  return reject(error)
                }
              )
            } else {
              // TODO: Check if we should commit

              return resolve(true)
            }
          }
        },

        error => {
          reject(error)
        }
      )
    })
  }

}