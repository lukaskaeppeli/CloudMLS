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

import { axiosClient, CloudMLS } from '..';
import { KeyServer } from './keyserver';
import { MLSservice } from './mls-wrapper';
import { Delivery as Delivery_Types, MLS } from './types';

interface MessageStore {
  platform: string,
  receiver: string,
  message: string
}

let messageStore: MessageStore[] = []


export namespace Delivery {

  export function destroy() {
    messageStore.splice(0, messageStore.length)
  }

  /**
   * Fetches all messages for the specified account from the delivery server.
   * The delivery server then removes all messages such that they can not be
   * fetched twice. 
   * 
   * @param platform from which the messages should be retrieved
   * @param account_id for which the messages are requested
   * @returns A Promise that only gets resolved once all messages are handled
   *          or an error is rejected
   */
  export async function fetchMessages(platform: string, account_id: string): Promise<void> {
    return new Promise((resolve, reject) => {

      axiosClient.get(CloudMLS.servers.delivery_server_url + "/delivery/" + platform + "/" + account_id)
        .then((response) => {
          if (response.data["response"].length == 0) {
            console.log(`#DeliveryService: Account ${platform}/${account_id} has no messages`)
            return resolve()
          }

          KeyServer.getKeyPackageData(platform, account_id).then(
            async keypackageData => {
              let messages = response.data["response"].map(serializedMessage => JSON.parse(serializedMessage))
              for (let message of messages) {
                // Need to await all results such that messages stay in order when one group has multiple updates
                let groupState = await KeyServer.getGroupState(platform, account_id, message.group_id)
                try {
                  let updatedGroupState = await MLSservice.handleMlsMessage(message, keypackageData, groupState)
                  await KeyServer.postGroupState(account_id, platform, updatedGroupState)
                } catch (error) {
                  // Just skip malformed requests
                }
              }

              return resolve()
            },

            error => {
              return reject(error)
            }
          )
        })
        .catch(error => {
          return reject(error)
        })
    })
  }

  /**
   * Stores a message to be sent to the delivery server once sendAll() is called. 
   * The message itself will be sent as JSON.stringify(message) such that the 
   * server does not need to parse it
   * 
   * @param from The account identifier of the caller, e.g. telegramService.getOwnId()
   * @param to The account identifier of the recipient
   * @param platform The platform for which the message is sent
   * @param group_id The group identifier corresponding to the message
   * @param message_type Commit, Welcome, ... --> See enum MessageType
   * @param mls_message The message itself
   * @param creationTime The creation time of the mls group, needed to break ties
   * @returns void
   */
  export function storeMlsMessage(
    from: string,
    to: string,
    platform: string,
    group_id: string,
    message_type: MLS.MessageType,
    mls_message: string,
    creationTime: number
  ) {

    let message: Delivery_Types.Message = {
      src_account: from,
      group_id: group_id,
      message_type: message_type,
      creationTime: creationTime,
      mls_message: mls_message
    }

    let postObject: MessageStore = {
      platform: platform,
      receiver: to,
      message: JSON.stringify(message)
    }

    messageStore.push(postObject)
  }

  /**
   * Sends all messages from the messageStore at once. Therefore, the message store
   * is copied such that new stored messages don't get deleted once the post request
   * has finished.
   * 
   * @returns A new promise that gets resolved once all messages are
   *          stored on the delivery server
   */
  export async function sendAll(): Promise<void> {
    let messageStoreCopy = messageStore.slice()
    messageStore = []

    return axiosClient.post(CloudMLS.servers.delivery_server_url + "/delivery/", messageStoreCopy)
  }
}
