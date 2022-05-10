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
import { KeyServer as KeyServer_Types, MLS } from './types'
import { MLSservice } from './mls-wrapper';
import { Delivery } from './delivery';
import { KeyServer } from './keyserver';


export namespace Groups {

  /**
   * Passive group management method. This method updates the MLS group datastructure according
   * to the group state of the messenger platform. The updates are determined by comparing the
   * members of the MLS group with the group members of the messenger platform. It also checks
   * if for an existing group, an MLS group can be created by checking if every member has a 
   * valid keypackage
   * 
   * @param platform on which the group is
   * @param account_id of the caller on the specified platform
   * @param group_id of the group on the platform
   * @param group_members of the group on the platform
   * @returns Promise that resolves to true if the group is encrypted
   */
  export async function update(platform: string, account_id: string, group_id: string, group_members: string[]): Promise<boolean> {
    console.log(`#GroupService: checkGroupState: have group with id ${group_id} and members ${group_members}`)

    return new Promise((resolve, reject) => {
      // Need to ensure that welcome messages are handled before we create a group
      Delivery.fetchMessages(platform, account_id)
        .then(() => KeyServer.getGroupState(platform, account_id, group_id))
        .then(async groupState => {

          // Check if all keypackages are valid and create list of keypackages
          let keypackages: Uint8Array[] = []
          let allKeyPackagesValid = group_members.length > 0 // Prevent creation of empty groups
          for (let memberId of group_members) {
            // We don't need our keypackage
            if (memberId != account_id) {
              let memberKeyPackage = await KeyServer.getKeyPackage(platform, memberId)

              if (memberKeyPackage && await MLSservice.isKeyPackageValid(memberKeyPackage)) {
                keypackages.push(memberKeyPackage)
              } else {
                allKeyPackagesValid = false
                break
              }
            }
          }

          console.log(`#GroupService: checkGroupState: id ${group_id}: allKeyPackagesValid = ${allKeyPackagesValid} and groupState defined = ${groupState != undefined}`)

          if (allKeyPackagesValid) {

            if (groupState == undefined) {

              // Start MLS
              console.log(`#GroupService: checkGroupState: starting MLS`)
              KeyServer.getKeyPackageData(platform, account_id).then(
                myKeypackageData => {
                  MLSservice.createGroup(group_id.toString(), keypackages, myKeypackageData).then(
                    ([serializedGroup, mlsplaintext, welcomeBuffer]) => {
                      let welcome = bytesToBase64(welcomeBuffer)

                      let creationTime = new Date().getTime()
                      for (let member of group_members) {
                        if (member != account_id)
                          Delivery.storeMlsMessage(account_id, member, platform, group_id, MLS.MessageType.WELCOME, welcome, creationTime)
                      }


                      let newGroupState: KeyServer_Types.GroupState = {
                        group_id: group_id,
                        members: new Set(group_members),
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
                })

            } else {
              // Check for new members --> Only needed if members added through official client (e.g. Telegram Application)
              let newMembers = []
              let newMemberIds = []
              for (let newMemberId of group_members) {
                if (!groupState.members.has(newMemberId)) {
                  newMemberIds.push(newMemberId)
                  newMembers.push(await KeyServer.getKeyPackage(platform, newMemberId))
                }
              }

              // check for members that have left --> Only needed if members added through official client (e.g. Telegram Application)
              let leftMembers = []
              for (let member of groupState.members) {
                if (!group_members.includes(member)) {
                  leftMembers.push(member)
                }
              }

              // If we have changes, apply them
              if (newMembers.length > 0 || leftMembers.length > 0) {
                KeyServer.getKeyPackageData(platform, account_id).then(
                  myKeypackageData => {

                    MLSservice.generateUpdateMessages(newMembers, leftMembers, groupState, myKeypackageData).then(
                      ([mlsCiphertextBuffer, updatedGroupState, welcomeBuffer]) => {
                        let commitMessage = bytesToBase64(mlsCiphertextBuffer)

                        for (let member of groupState.members) {
                          if (member != account_id)
                            Delivery.storeMlsMessage(account_id, member, platform, group_id, MLS.MessageType.COMMIT, commitMessage, 0)
                        }

                        if (newMembers.length > 0) {
                          let welcome = bytesToBase64(welcomeBuffer)
                          for (let member of newMemberIds) {
                            Delivery.storeMlsMessage(account_id, member, platform, group_id, MLS.MessageType.WELCOME, welcome, groupState.creationTime)
                          }
                        }

                        updatedGroupState.members = new Set(group_members)

                        KeyServer.postGroupState(account_id, platform, updatedGroupState).then(
                          () => {
                            Delivery.sendAll()
                              .then(
                                () => { return resolve(true) }
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
                  },

                  error => {
                    return reject(error)
                  }
                )

              } else {
                return resolve(true)
              }

            }


          } else { // allKeypackagesValid = false
            if (groupState != undefined) {
              // There are two possibilities, how the control flow can end here.
              //  - There is at least one new member that joined and has not (yet) installed Athena.
              //    Sending a plaintext message to the group, informing the newcomer(s) to install
              //    Athena should not be called from here as this method gets executed many times by each
              //    member resulting in flooding the chat with the same plaintext message
              //  - Some members have an expired keypackage. This is not a problem, as have already joined
              //    The group.
              //
              // True is retured as this group exists and therefore is encrypted. 
              return resolve(true)
            }
            return resolve(false)
          }
        })



    })
  }


  /**
 * Active group management method. Creates a new group and sends the welcome messages to
 * all members of that group. Finally uploads the resulting group state to the keyserver.
 * 
 * @param platform on which the group will be located
 * @param account_id on the specified platform
 * @param group_id of the group being created
 * @param group_members list of ids which should be removed from the group
 * @returns A promise that gets either resolved to void or an error is rejected
 */
  export async function create(platform: string, account_id: string, group_id: string, group_members: string[]): Promise<void> {
    return new Promise((resolve, reject) => {
      Delivery.fetchMessages(platform, account_id)
        .then(() => KeyServer.getKeyPackageData(platform, account_id))
        .then((myKeypackageData) => {
          Promise.all(group_members.map(
            id => KeyServer.getKeyPackage(platform, id)
          )).then(
            keypackages => {
              keypackages.forEach(keypackage => {
                if (!keypackage) return reject(new Error("some keypackage is undefined"))
              })

              MLSservice.createGroup(group_id.toString(), keypackages, myKeypackageData).then(
                ([serializedGroup, mlsplaintext, welcomeBuffer]) => {
                  let welcome = bytesToBase64(welcomeBuffer)

                  let creationTime = new Date().getTime()
                  for (let member of group_members) {
                    if (member != account_id)
                      Delivery.storeMlsMessage(account_id, member, platform, group_id, MLS.MessageType.WELCOME, welcome, creationTime)
                  }

                  let newGroupState: KeyServer_Types.GroupState = {
                    group_id: group_id,
                    members: new Set(group_members),
                    creationTime: creationTime,
                    mlsEpochState: new Map<number, string>([[1, serializedGroup]]),
                    latestEpoch: 1,
                    updateCounter: 0,
                  }

                  KeyServer.postGroupState(account_id, platform, newGroupState).then(
                    () => {
                      Delivery.sendAll()
                        .then(() => { return resolve() })
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
            }
          )
        })
        .catch(error => { return reject(error) })
    })
  }


  /**
  * Active group management method. First fetches all messages from the delivery server 
  * to have the most actual view of the corresponding group. Fetches the needed data 
  * from the keyserver, applies the specified adds and pushes the updated group 
  * states to the keyserver again. Also delivers the mls messages at the end.
  * 
  * @param platform on which the group is located
  * @param account_id on the specified platform
  * @param group_id of the group being changed
  * @param newMember_ids list of ids which should be added to the group. If some of these members
  *                      are already in the group, they get ignored
  * @returns A promise that gets eiter resolved to void or an error is rejected
  */
  export async function addMembers(platform: string, account_id: string, group_id: string, newMember_ids: string[]): Promise<void> {
    return new Promise((resolve, reject) => {
      Delivery.fetchMessages(platform, account_id)
        .then(() => KeyServer.getGroupState(platform, account_id, group_id))
        .then(groupState => {
          if (!groupState) {
            return reject(new Error("Failed to fetch group state"))
          }

          KeyServer.getKeyPackageData(platform, account_id).then(
            async myKeypackageData => {

              let filteredMembers = newMember_ids.filter(member_id => !groupState.members.has(member_id))

              // Fetch all keypackages and filter out undefined packages
              let newKeypackages = await Promise.all(filteredMembers
                .map(async id => await KeyServer.getKeyPackage(platform, id))
                .filter(keypackage => !!keypackage))

              const [mlsCiphertextBuffer, updatedGroupState, welcomeBuffer] = await MLSservice.generateUpdateMessages(newKeypackages, [], groupState, myKeypackageData)
              let commitMessage = bytesToBase64(mlsCiphertextBuffer)

              for (let member of groupState.members) {
                if (member != account_id)
                  Delivery.storeMlsMessage(account_id, member, platform, group_id, MLS.MessageType.COMMIT, commitMessage, 0)
              }

              let welcome = bytesToBase64(welcomeBuffer)
              for (let member of filteredMembers) {
                Delivery.storeMlsMessage(account_id, member, platform, group_id, MLS.MessageType.WELCOME, welcome, groupState.creationTime)
              }

              updatedGroupState.members = new Set([...groupState.members, ...newMember_ids])

              KeyServer.postGroupState(account_id, platform, updatedGroupState).then(
                () => {
                  Delivery.sendAll()
                    .then(() => {
                      return resolve()
                    })
                },

                error => {
                  Delivery.destroy()
                  return reject(error)
                }
              )
            },

            error => {
              return reject(error)
            })
        })
    })
  }

  /**
   * Active group management method. First fetches all messages from the delivery server 
   * to have the most actual view of the corresponding group. Fetches the needed data 
   * from the keyserver, applies the specified removals and pushes the updated group 
   * states to the keyserver again. Also delivers the mls messages at the end.
   * 
   * @param platform on which the group is located
   * @param account_id on the specified platform
   * @param group_id of the group being changed
   * @param oldMember_ids list of ids which should be removed from the group
   * @returns A promise that gets eiter resolved to void or an error is rejected
   */
  export async function removeMembers(platform: string, account_id: string, group_id: string, oldMember_ids: string[]): Promise<void> {
    return new Promise((resolve, reject) => {
      Delivery.fetchMessages(platform, account_id)
        .then(() => KeyServer.getGroupState(platform, account_id, group_id))
        .then(groupState => {
          if (!groupState) {
            return reject(new Error("Failed to fetch group state"))
          }

          KeyServer.getKeyPackageData(platform, account_id).then(
            async myKeypackageData => {

              const [mlsCiphertextBuffer, updatedGroupState, welcomeBuffer] = await MLSservice.generateUpdateMessages([], oldMember_ids, groupState, myKeypackageData)
              let commitMessage = bytesToBase64(mlsCiphertextBuffer)

              for (let member of groupState.members) {
                if (member != account_id)
                  Delivery.storeMlsMessage(account_id, member, platform, group_id, MLS.MessageType.COMMIT, commitMessage, 0)
              }

              oldMember_ids.forEach(old_member => updatedGroupState.members.delete(old_member))

              KeyServer.postGroupState(account_id, platform, groupState).then(
                () => {
                  Delivery.sendAll()
                    .then(() => {
                      return resolve()
                    })
                },

                error => {
                  Delivery.destroy()
                  return reject(error)
                }
              )
            },

            error => {
              return reject(error)
            })
        })
    })
  }
}
