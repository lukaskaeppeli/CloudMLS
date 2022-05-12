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

import { bytesToBase64 } from "byte-base64";
import { axiosClient, CloudMLS } from "../src/index";
import { AccountManager } from "../src/accountManager";
import { Authentication } from "../src/authentication";
import { Dialogs } from "../src/dialogs";
import { Groups } from "../src/groups";
import { KeyServer } from "../src/keyserver";
import { Message } from "../src/message";
import { Group } from "../src/mls-ts/src/group";
import { MLSservice } from "../src/mls-wrapper";
import { Delivery } from "../src/types";
import { groups, users } from "./config.spec";


describe("CloudMLS", () => {

    beforeAll(function () {
        jasmine.DEFAULT_TIMEOUT_INTERVAL = 10000;
    });


    it("Should register each user", async function () {
        let successful = false
        try {
            for (let user of users) {
                await Authentication.register({ username: user.username, password: user.password })
            }
            successful = true
        } catch {
            successful = false
        } finally {
            expect(successful).toBe(true)
        }
    })

    it("Should login and logout all users", async function () {
        for (let user of users) {
            await Authentication.login({ username: user.username, password: user.password })
            expect(Authentication.isAuthenticated.value).toBe(true)
            await Authentication.logout()
            expect(Authentication.isAuthenticated.value).toBe(false)
        }
    })

    it("Should not login with wrong password", async function () {
        let failed = false
        try {
            await Authentication.login({ username: users[0].username, password: "Wrong password" })
        } catch {
            failed = true
        } finally {
            expect(failed).toBe(true)
        }
    })


    it("Should have a correct keystore", async function () {
        await Authentication.login({ username: users[0].username, password: users[0].password })
        expect(CloudMLS.keystore.get_encryption_key()).toBeDefined()
        expect(CloudMLS.keystore.get_local_key()).toBeDefined()
        expect(CloudMLS.keystore.get_username()).toEqual(users[0].username)
        expect(CloudMLS.keystore.get_username_hash()).toBeDefined()

        const enc_key = CloudMLS.keystore.get_encryption_key()
        const loc_key = CloudMLS.keystore.get_local_key()
        const username = CloudMLS.keystore.get_username()
        const userhash = CloudMLS.keystore.get_username_hash()

        await Authentication.logout()
        expect(CloudMLS.keystore.get_encryption_key()).toBeUndefined()
        expect(CloudMLS.keystore.get_local_key()).toBeUndefined()
        expect(CloudMLS.keystore.get_username()).toBeUndefined()
        expect(CloudMLS.keystore.get_username_hash()).toBeUndefined()

        await Authentication.login({ username: users[0].username, password: users[0].password })
        expect(CloudMLS.keystore.get_encryption_key()).toEqual(enc_key)
        expect(CloudMLS.keystore.get_local_key()).toEqual(loc_key)
        expect(CloudMLS.keystore.get_username()).toEqual(username)
        expect(CloudMLS.keystore.get_username_hash()).toEqual(userhash)

        await Authentication.logout()

    })

    it("should create correct lifetime extensions for keypackages", async function () {
        let packageData = await MLSservice.createKeyPackage("my_unique_user_id")
        expect(await MLSservice.isKeyPackageValid(packageData.keypackage)).toBe(true)
        expect(await MLSservice.isKeyPackageValid(packageData.keypackage, (1000 * 3600 * 24 * 29))).toBe(true)
        expect(await MLSservice.isKeyPackageValid(packageData.keypackage, (1000 * 3600 * 24 * 30))).toBe(false)
    })

    it("should store keypackage data correctly", async function () {
        const temp_user = { username: "tempuser", password: "tempuser" }
        const temp_account = { platform: "temp_platform", account_id: "my_unique_user_id", keypackage: "" }

        await Authentication.register(temp_user)
        await Authentication.login(temp_user)

        // Register account manually
        AccountManager.accounts.push(temp_account)
        await axiosClient.post(CloudMLS.servers.key_server_url + "/account", temp_account)

        // Create and upload keypackage        
        const packageData = await MLSservice.createKeyPackage("my_uinque_user_id")
        await KeyServer.updateKeyPackage(temp_account.platform, temp_account.account_id, packageData)

        const packageData1 = await KeyServer.getKeyPackageData(temp_account.platform, temp_account.account_id)
        expect(packageData1).toEqual(packageData)

        // Manually set keypackage to enable update
        AccountManager.accounts[0].keypackage = bytesToBase64(packageData.keypackage)

        // Force update
        await AccountManager.updateKeyPackage(temp_account, true)
        expect(await KeyServer.getKeyPackageData(temp_account.platform, temp_account.account_id)).not.toBe(packageData)

        await Authentication.logout()
    })


    it('should add accounts', async function () {
        for (let user of users) {
            await Authentication.login({ username: user.username, password: user.password })

            // Register accounts
            for (let record in user.accounts) {
                await AccountManager.addAccount(record, user.accounts[record])
            }

            await Authentication.logout()

            await Authentication.login({ username: user.username, password: user.password })
            console.log(AccountManager.accounts)

            // Check that accounts registered on server
            for (let record in user.accounts) {
                let found = false
                for (let mlsAccount of AccountManager.accounts) {
                    if (record === mlsAccount.platform && user.accounts[record] === mlsAccount.account_id) {
                        found = true
                        break
                    }
                }

                expect(found).toBe(true)
            }

            await Authentication.logout()
        }
    })

    it('should create groups in passive mode', async function () {
        const platform = "telegram"
        const group = "telegram1"

        // Let testuser_1 create a group with testuser_2 and testuser_3 on platform testplatform1
        let user = users[0]
        let user_id = user.accounts[platform]
        await Authentication.login({ username: user.username, password: user.password })
        let createdGroup = await Groups.update(platform, user_id, group, groups[group])
        expect(createdGroup).toBe(true)

        await Authentication.logout()

        // Check that user2 is actually in that group
        user = users[1]
        user_id = user.accounts[platform]
        await Authentication.login({ username: user.username, password: user.password })
        let groupState = await KeyServer.getGroupState(platform, user_id, group)
        expect(groupState).toBeDefined()
        await Authentication.logout()

        // Check that user3 is actually in that group
        user = users[2]
        user_id = user.accounts[platform]
        await Authentication.login({ username: user.username, password: user.password })
        let groupState3 = await KeyServer.getGroupState(platform, user_id, group)
        expect(groupState3).toBeDefined()
        await Authentication.logout()

    })


    it('should create groups in active mode', async function () {
        const platform = "telegram"
        const group = "telegram2"

        // Let testuser_0 create a group with testuser_1 and testuser_2 on platform testplatform1
        let user = users[0]
        let user_id = user.accounts[platform]
        await Authentication.login({ username: user.username, password: user.password })
        await Groups.create(platform, user_id, group, groups[group])
        let groupState = await KeyServer.getGroupState(platform, user_id, group)
        expect(groupState).toBeDefined()
        expect(groupState.members.size).toBe(3)
        groupState.members.forEach(
            member => expect(groups[group].includes(member)).toBe(true)
        )
        await Authentication.logout()

        // Check that user2 is actually in that group
        user = users[1]
        user_id = user.accounts[platform]
        await Authentication.login({ username: user.username, password: user.password })
        groupState = await KeyServer.getGroupState(platform, user_id, group)
        expect(groupState).toBeDefined()
        expect(groupState.members.size).toBe(3)
        groupState.members.forEach(
            member => expect(groups[group].includes(member)).toBe(true)
        )
        await Authentication.logout()

        // Check that user3 is actually in that group
        user = users[2]
        user_id = user.accounts[platform]
        await Authentication.login({ username: user.username, password: user.password })
        groupState = await KeyServer.getGroupState(platform, user_id, group)
        expect(groupState).toBeDefined()
        expect(groupState.members.size).toBe(3)
        groupState.members.forEach(
            member => expect(groups[group].includes(member)).toBe(true)
        )
        await Authentication.logout()
    })


    it("should be able to send and receive messages", async function () {
        const platform = "telegram"

        // We have telegram1 from previous tests with users 1, 2 and 3
        const group = "telegram1"

        const message1 = "message1"
        const message2 = "message2"
        const message3 = "message3"

        // Login user[0] and encrypt message1
        let user = users[0]
        let user_id = user.accounts[platform]
        await Authentication.login({ username: user.username, password: user.password })
        let [ciphertext_1_0, successful] = await Message.encrypt(message1, platform, user_id, group)
        expect(successful).toBe(true)
        await Authentication.logout()

        // Login user[1] and decrypt message1
        user = users[1]
        user_id = user.accounts[platform]
        await Authentication.login({ username: user.username, password: user.password })
        let [plaintext, successful1] = await Message.decrypt(ciphertext_1_0, (new Date()).getTime(), platform, user_id, group)
        expect(successful1).toBe(true)
        expect(plaintext).toEqual(message1)

        // encrypt message2
        let [ciphertext_2_1, successful2] = await Message.encrypt(message2, platform, user_id, group)
        expect(successful2).toEqual(true)
        await Authentication.logout()

        // Login user[2] and decrypt message1 and message2
        user = users[2]
        user_id = user.accounts[platform]
        await Authentication.login({ username: user.username, password: user.password })
        let [plaintext1, successful3] = await Message.decrypt(ciphertext_1_0, (new Date()).getTime(), platform, user_id, group)
        expect(successful3).toBe(true)
        expect(plaintext1).toEqual(message1)

        let [plaintext2, successful4] = await Message.decrypt(ciphertext_2_1, (new Date()).getTime(), platform, user_id, group)
        expect(successful4).toBe(true)
        expect(plaintext2).toEqual(message2)

        // encrypt message3
        let [ciphertext_3_2, successful5] = await Message.encrypt(message3, platform, user_id, group)
        expect(successful5).toBe(true)
        await Authentication.logout()

        // Login user[0] and decrypt message3 and message 2
        user = users[0]
        user_id = user.accounts[platform]
        await Authentication.login({ username: user.username, password: user.password })
        let [plaintext3, successful6] = await Message.decrypt(ciphertext_3_2, (new Date()).getTime(), platform, user_id, group)
        expect(successful6).toBe(true)
        expect(plaintext3).toEqual(message3)
        let [plaintext4, successful7] = await Message.decrypt(ciphertext_2_1, (new Date()).getTime(), platform, user_id, group)
        expect(successful7).toBe(true)
        expect(plaintext4).toEqual(message2)
        await Authentication.logout()

        // Login user[1] and decrypt message3
        user = users[1]
        user_id = user.accounts[platform]
        await Authentication.login({ username: user.username, password: user.password })
        let [plaintext5, successful8] = await Message.decrypt(ciphertext_3_2, (new Date()).getTime(), platform, user_id, group)
        expect(successful8).toBe(true)
        expect(plaintext5).toEqual(message3)
        await Authentication.logout()
    })

    it("should add and remove members passively", async function () {
        // Let us add member 4 to the group telegram1

        const group = "telegram1"
        const platform = "telegram"

        let user = users[0]
        let user_id = user.accounts[platform]
        await Authentication.login({ username: user.username, password: user.password })

        // Group was at epoch 1 from previous test
        let groupState = await KeyServer.getGroupState(platform, user_id, group)
        expect(groupState.latestEpoch).toBe(1)

        await Groups.update(platform, user_id, group, [...groups[group], users[4].accounts[platform]])

        // Now there should be an additional member in the group
        groupState = await KeyServer.getGroupState(platform, user_id, group)
        expect(groupState.members.size).toBe(4)
        expect(groupState.latestEpoch).toBe(2)
        await Authentication.logout()

        // Now user 4 should have a welcome message
        user = users[4]
        user_id = user.accounts[platform]
        await Authentication.login({ username: user.username, password: user.password })
        // Messages are fetched automatically :D

        groupState = await KeyServer.getGroupState(platform, user_id, group)
        expect(groupState.members.size).toBe(4)
        expect(groupState.latestEpoch).toBe(2)

        // And now we should be able to send messages
        const message = "Hello world!"
        const [ciphertext, successful] = await Message.encrypt(message, platform, user_id, group)
        expect(successful).toBe(true)

        // And we may now also invite other members
        await Groups.update(platform, user_id, group, [...groups[group], users[4].accounts[platform], users[5].accounts[platform]])
        groupState = await KeyServer.getGroupState(platform, user_id, group)
        expect(groupState.members.size).toBe(5)
        expect(groupState.latestEpoch).toBe(3)

        await Authentication.logout()

        // Now user 5 should have a welcome message
        user = users[5]
        user_id = user.accounts[platform]
        await Authentication.login({ username: user.username, password: user.password })
        // Messages are fetched automatically :D

        groupState = await KeyServer.getGroupState(platform, user_id, group)
        expect(groupState.members.size).toBe(5)
        expect(groupState.latestEpoch).toBe(3)

        // But i was added after message "Hello world!", was encrypted, thus I can't read it
        const [_, notSuccessful] = await Message.decrypt(ciphertext, (new Date()).getTime(), platform, user_id, group)
        expect(notSuccessful).toBe(false)
        await Authentication.logout()

        // User 0 should be able to read the message
        user = users[0]
        user_id = user.accounts[platform]
        await Authentication.login({ username: user.username, password: user.password })

        groupState = await KeyServer.getGroupState(platform, user_id, group)
        expect(groupState.members.size).toBe(5)
        expect(groupState.latestEpoch).toBe(3)

        let [plaintext, successful2] = await Message.decrypt(ciphertext, (new Date()).getTime(), platform, user_id, group)
        expect(successful2).toBe(true)
        expect(plaintext).toEqual(message)

        // Now, the group is too large, let us remove member 2
        await Groups.update(platform, user_id, group, [users[0].accounts[platform], users[1].accounts[platform], users[4].accounts[platform], users[5].accounts[platform]])

        groupState = await KeyServer.getGroupState(platform, user_id, group)
        expect(groupState.members.size).toBe(4)
        expect(groupState.latestEpoch).toBe(4)

        // And now i share a secret that 2 will not be able to read...
        const secret_message = "It works!"
        const [ciphertext1, successful3] = await Message.encrypt(secret_message, platform, user_id, group)
        expect(successful3).toBe(true)
        await Authentication.logout()

        // Now verify that user 2 can't read the message
        user = users[2]
        user_id = user.accounts[platform]
        await Authentication.login({ username: user.username, password: user.password })

        const [__, notSuccessful2] = await Message.decrypt(ciphertext1, (new Date()).getTime(), platform, user_id, group)
        expect(notSuccessful2).toBe(false)
        await Authentication.logout()

        // But member 5 can read the message
        user = users[5]
        user_id = user.accounts[platform]
        await Authentication.login({ username: user.username, password: user.password })

        groupState = await KeyServer.getGroupState(platform, user_id, group)
        expect(groupState.members.size).toBe(4)
        expect(groupState.latestEpoch).toBe(4)

        const [plaintext2, successful4] = await Message.decrypt(ciphertext1, (new Date()).getTime(), platform, user_id, group)
        expect(successful4).toBe(true)
        expect(plaintext2).toEqual(secret_message)
        await Authentication.logout()
    })


    it("should add members to a group actively", async function () {

        // Let us add member 4 to the group telegram2

        const group = "telegram2"
        const platform = "telegram"

        let user = users[0]
        let user_id = user.accounts[platform]
        await Authentication.login({ username: user.username, password: user.password })

        // Group was at epoch 1 from previous test
        let groupState = await KeyServer.getGroupState(platform, user_id, group)
        expect(groupState.latestEpoch).toBe(1)

        await Groups.addMembers(platform, user_id, group, [users[4].accounts[platform]])

        // Now there should be an additional member in the group
        groupState = await KeyServer.getGroupState(platform, user_id, group)
        expect(groupState.members.size).toBe(4)
        groupState.members.forEach(
            member => expect([...groups[group], users[4].accounts[platform]].includes(member)).toBe(true)
        )
        expect(groupState.latestEpoch).toBe(2)
        await Authentication.logout()

        // Now user 4 should have a welcome message
        user = users[4]
        user_id = user.accounts[platform]
        await Authentication.login({ username: user.username, password: user.password })
        // Messages are fetched automatically :D

        groupState = await KeyServer.getGroupState(platform, user_id, group)
        expect(groupState.members.size).toBe(4)
        groupState.members.forEach(
            member => expect([...groups[group], users[4].accounts[platform]].includes(member)).toBe(true)
        )
        expect(groupState.latestEpoch).toBe(2)

        // And now we should be able to send messages
        const message = "Hello world!"
        const [ciphertext, successful] = await Message.encrypt(message, platform, user_id, group)
        expect(successful).toBe(true)

        // And we may now also invite other members
        await Groups.addMembers(platform, user_id, group, [users[5].accounts[platform]])
        groupState = await KeyServer.getGroupState(platform, user_id, group)
        expect(groupState.members.size).toBe(5)
        groupState.members.forEach(
            member => expect([...groups[group], users[4].accounts[platform], users[5].accounts[platform]].includes(member)).toBe(true)
        )
        expect(groupState.latestEpoch).toBe(3)

        await Authentication.logout()

        // Now user 5 should have a welcome message
        user = users[5]
        user_id = user.accounts[platform]
        await Authentication.login({ username: user.username, password: user.password })
        // Messages are fetched automatically :D

        groupState = await KeyServer.getGroupState(platform, user_id, group)
        expect(groupState.members.size).toBe(5)
        groupState.members.forEach(
            member => expect([...groups[group], users[4].accounts[platform], users[5].accounts[platform]].includes(member)).toBe(true)
        )
        expect(groupState.latestEpoch).toBe(3)

        // But i was added after message "Hello world!", was encrypted, thus I can't read it
        const [_, notSuccessful] = await Message.decrypt(ciphertext, (new Date()).getTime(), platform, user_id, group)
        expect(notSuccessful).toBe(false)
        await Authentication.logout()

        // User 0 should be able to read the message
        user = users[0]
        user_id = user.accounts[platform]
        await Authentication.login({ username: user.username, password: user.password })

        groupState = await KeyServer.getGroupState(platform, user_id, group)
        expect(groupState.members.size).toBe(5)
        groupState.members.forEach(
            member => expect([...groups[group], users[4].accounts[platform], users[5].accounts[platform]].includes(member)).toBe(true)
        )
        expect(groupState.latestEpoch).toBe(3)

        let [plaintext, successful2] = await Message.decrypt(ciphertext, (new Date()).getTime(), platform, user_id, group)
        expect(successful2).toBe(true)
        expect(plaintext).toEqual(message)

        // Now, the group is too large, let us remove member 2
        await Groups.removeMembers(platform, user_id, group, [users[2].accounts[platform]])

        groupState = await KeyServer.getGroupState(platform, user_id, group)
        expect(groupState.members.size).toBe(4)
        groupState.members.forEach(
            member => expect([users[0].accounts[platform], users[1].accounts[platform], users[4].accounts[platform], users[5].accounts[platform]].includes(member)).toBe(true)
        )
        expect(groupState.latestEpoch).toBe(4)

        // And now i share a secret that 2 will not be able to read...
        const secret_message = "It works!"
        const [ciphertext1, successful3] = await Message.encrypt(secret_message, platform, user_id, group)
        expect(successful3).toBe(true)
        await Authentication.logout()

        // Now verify that user 2 can't read the message
        user = users[2]
        user_id = user.accounts[platform]
        await Authentication.login({ username: user.username, password: user.password })

        const [__, notSuccessful2] = await Message.decrypt(ciphertext1, (new Date()).getTime(), platform, user_id, group)
        expect(notSuccessful2).toBe(false)
        await Authentication.logout()

        // But member 5 can read the message
        user = users[5]
        user_id = user.accounts[platform]
        await Authentication.login({ username: user.username, password: user.password })

        groupState = await KeyServer.getGroupState(platform, user_id, group)
        expect(groupState.members.size).toBe(4)
        groupState.members.forEach(
            member => expect([users[0].accounts[platform], users[1].accounts[platform], users[4].accounts[platform], users[5].accounts[platform]].includes(member)).toBe(true)
        )
        expect(groupState.latestEpoch).toBe(4)

        const [plaintext2, successful4] = await Message.decrypt(ciphertext1, (new Date()).getTime(), platform, user_id, group)
        expect(successful4).toBe(true)
        expect(plaintext2).toEqual(secret_message)
        await Authentication.logout()
    })


    it("should add and remove multiple members in passive mode", async function () {
        const group = "whatsapp1"
        const platform = "whatsapp"

        let user = users[0]
        let user_id = user.accounts[platform]
        await Authentication.login({ username: user.username, password: user.password })


        // Creating a group with myself
        await Groups.update(platform, user_id, group, [user_id])
        let groupState = await KeyServer.getGroupState(platform, user_id, group)
        expect(groupState.members.size).toBe(1)
        expect(groupState.members.has(user_id))


        // Add 5 other members
        await Groups.update(platform, user_id, group, groups[group])
        groupState = await KeyServer.getGroupState(platform, user_id, group)
        expect(groupState.members.size).toBe(6)
        groupState.members.forEach(
            member => expect(groups[group].includes(member)).toBe(true)
        )
        await Authentication.logout()

        // Now each member should have received a welcome message
        for (let member of [1, 2, 3, 4, 5]) {
            user = users[member]
            user_id = user.accounts[platform]
            await Authentication.login({ username: user.username, password: user.password })

            groupState = await KeyServer.getGroupState(platform, user_id, group)
            expect(groupState.members.size).toBe(6)
            groupState.members.forEach(
                member => expect(groups[group].includes(member)).toBe(true)
            )
            await Authentication.logout()
        }

        // Too many people, alone is better, thus I kick all the others
        user = users[0]
        user_id = user.accounts[platform]
        await Authentication.login({ username: user.username, password: user.password })
        await Groups.update(platform, user_id, group, [user_id])
        groupState = await KeyServer.getGroupState(platform, user_id, group)
        expect(groupState.members.size).toBe(1)
        expect(groupState.members.has(user_id))

        await Authentication.logout()
    })


    it("should add and remove multiple members in active mode", async function () {
        const group = "whatsapp2"
        const platform = "whatsapp"

        let user = users[0]
        let user_id = user.accounts[platform]
        await Authentication.login({ username: user.username, password: user.password })


        // Creating a group with myself
        await Groups.create(platform, user_id, group, [user_id])
        let groupState = await KeyServer.getGroupState(platform, user_id, group)
        expect(groupState.members.size).toBe(1)
        expect(groupState.members.has(user_id))


        // Add 5 other members
        await Groups.addMembers(platform, user_id, group, groups[group])
        groupState = await KeyServer.getGroupState(platform, user_id, group)
        expect(groupState.members.size).toBe(6)
        groupState.members.forEach(
            member => expect(groups[group].includes(member)).toBe(true)
        )
        await Authentication.logout()

        // Now each member should have received a welcome message
        for (let member of [1, 2, 3, 4, 5]) {
            user = users[member]
            user_id = user.accounts[platform]
            await Authentication.login({ username: user.username, password: user.password })

            groupState = await KeyServer.getGroupState(platform, user_id, group)
            expect(groupState.members.size).toBe(6)
            groupState.members.forEach(
                member => expect(groups[group].includes(member)).toBe(true)
            )
            await Authentication.logout()
        }

        // Too many people, alone is better, thus I kick all the others
        user = users[0]
        user_id = user.accounts[platform]
        await Authentication.login({ username: user.username, password: user.password })

        const other_members = groups[group].filter(member => member != user_id)
        await Groups.removeMembers(platform, user_id, group, other_members)
        groupState = await KeyServer.getGroupState(platform, user_id, group)
        expect(groupState.members.size).toBe(1)
        expect(groupState.members.has(user_id))

        await Authentication.logout()
    })

    it("should decrypt ciphertexts from previous epochs", async function () {
        const group = "whatsapp3"
        const platform = "whatsapp"

        let user = users[0]
        let user_id = user.accounts[platform]
        await Authentication.login({ username: user.username, password: user.password })

        await Dialogs.update(platform, user_id, users[1].accounts[platform], group)
        const [ciphertext, success] = await Message.encrypt("HELLO", platform, user_id, group)
        expect(success).toBe(true)

        await Authentication.logout()


        user = users[1]
        user_id = user.accounts[platform]
        await Authentication.login({ username: user.username, password: user.password })

        expect(await Message.decrypt(ciphertext, (new Date).getTime(), platform, user_id, group)).toEqual(["HELLO", true])

        let groupState = await KeyServer.getGroupState(platform, user_id, group)
        expect(groupState.latestEpoch).toBe(1)
        await Groups.addMembers(platform, user_id, group, [users[2].accounts[platform]])
        groupState = await KeyServer.getGroupState(platform, user_id, group)
        expect(groupState.latestEpoch).toBe(2)
        await Groups.removeMembers(platform, user_id, group, [users[2].accounts[platform]])
        groupState = await KeyServer.getGroupState(platform, user_id, group)
        expect(groupState.latestEpoch).toBe(3)

        expect(await Message.decrypt(ciphertext, (new Date).getTime(), platform, user_id, group)).toEqual(["HELLO", true])

        await Authentication.logout()

        user = users[0]
        user_id = user.accounts[platform]
        await Authentication.login({ username: user.username, password: user.password })

        expect(groupState.latestEpoch).toBe(3)
        expect(await Message.decrypt(ciphertext, (new Date).getTime(), platform, user_id, group)).toEqual(["HELLO", true])
        await Authentication.logout()

    })

    it("should commit updates once a keypackage is updated", async function () {
        const group = "whatsapp2"
        const platform = "whatsapp"

        let user = users[0]
        let user_id = user.accounts[platform]
        await Authentication.login({ username: user.username, password: user.password })

        // Add 5 other members
        await Groups.addMembers(platform, user_id, group, groups[group])
        let groupState = await KeyServer.getGroupState(platform, user_id, group)
        expect(groupState.members.size).toBe(6)
        groupState.members.forEach(
            member => expect(groups[group].includes(member)).toBe(true)
        )

        // Now, the group whatsapp2 has 6 members. Updating my keypackage
        expect(groupState.latestEpoch).toBe(4)
        let account = AccountManager.accounts.filter(acc => acc.account_id == user_id && acc.platform == platform)[0]
        expect(account).toBeDefined()
        await AccountManager.updateKeyPackage(account, true)
        groupState = await KeyServer.getGroupState(platform, user_id, group)
        expect(groupState.latestEpoch).toBe(5)

        await Authentication.logout()

        // Now each member should have received a welcome message and a commit message
        for (let member of [1, 2, 3, 4, 5]) {
            user = users[member]
            user_id = user.accounts[platform]
            await Authentication.login({ username: user.username, password: user.password })

            groupState = await KeyServer.getGroupState(platform, user_id, group)
            expect(groupState.members.size).toBe(6)
            groupState.members.forEach(
                member => expect(groups[group].includes(member)).toBe(true)
            )
            expect(groupState.latestEpoch).toBe(5)

            await Authentication.logout()
        }

    })


    it("should remove old epoch states", async function () {
        const group = "whatsapp2"
        const platform = "whatsapp"

        let user = users[0]
        let user_id = user.accounts[platform]
        await Authentication.login({ username: user.username, password: user.password })

        await Groups.addMembers(platform, user_id, group, groups[group])
        let groupState = await KeyServer.getGroupState(platform, user_id, group)

        // We were in epoch 5 in the last test
        for (let i = 1; i <= 5; i++) {
            expect(groupState.mlsEpochState.get(i)).toBeDefined()
        }

        // Remove all up to 4
        await KeyServer.removeOldStates(user_id, platform, group, 4)

        // Verify that old ones are gone
        groupState = await KeyServer.getGroupState(platform, user_id, group)
        for (let i = 1; i <= 4; i++) {
            expect(groupState.mlsEpochState.get(i)).toBeUndefined()
        }
        expect(groupState.mlsEpochState.get(5)).toBeDefined()

        await Authentication.logout()
    })

    it("should agree on one group", async function () {
        const group = "whatsapp4"
        const platform = "whatsapp"

        let user = users[0]
        let user_id = user.accounts[platform]
        await Authentication.login({ username: user.username, password: user.password })

        // Need to create the group manually such that we can send welcome messages at the same time
        let message0 = await helper_create(platform, user_id, group, groups[group])

        await Authentication.logout()

        user = users[1]
        user_id = user.accounts[platform]
        await Authentication.login({ username: user.username, password: user.password })

        // Need to create the group manually such that we can send welcome messages at the same time
        let message1 = await helper_create(platform, user_id, group, groups[group])
        user_0_messages.push(message1)
        user_2_messages.push(message1)

        // Let us push the messages a bit delayed
        user_1_messages.push(message0)
        user_2_messages.push(message0)

        await Authentication.logout()

        // Now user 2 logs in and we fetch the messages manually
        user = users[2]
        user_id = user.accounts[platform]
        await Authentication.login({ username: user.username, password: user.password })

        let keypackageData = await KeyServer.getKeyPackageData(platform, user_id)
        let messages = user_2_messages.map(serializedMessage => JSON.parse(serializedMessage))
        for (let message of messages) {
            let groupState = await KeyServer.getGroupState(platform, user_id, message.group_id)
            let updatedGroupState = await MLSservice.handleMlsMessage(message, keypackageData, groupState)

            await KeyServer.postGroupState(user_id, platform, updatedGroupState)
        }

        // User 2 should now be in the same group as user 0
        await Authentication.logout()

        // Now user 1 logs in and we fetch the messages manually
        user = users[1]
        user_id = user.accounts[platform]
        await Authentication.login({ username: user.username, password: user.password })

        keypackageData = await KeyServer.getKeyPackageData(platform, user_id)
        messages = user_1_messages.map(serializedMessage => JSON.parse(serializedMessage))
        for (let message of messages) {
            // Need to await all results such that messages stay in order when one group has multiple updates
            let groupState = await KeyServer.getGroupState(platform, user_id, message.group_id)
            let updatedGroupState = await MLSservice.handleMlsMessage(message, keypackageData, groupState)

            await KeyServer.postGroupState(user_id, platform, updatedGroupState)
        }

        // User 1 should now be in the same group as user 0 as well
        const groupState1 = await KeyServer.getGroupState(platform, user_id, group)
        await Authentication.logout()

        user = users[2]
        user_id = user.accounts[platform]
        await Authentication.login({ username: user.username, password: user.password })
        const groupState2 = await KeyServer.getGroupState(platform, user_id, group)

        await Authentication.logout()

        let group1 = await Group.fromSerialized(groupState1.mlsEpochState.get(1))
        let group2 = await Group.fromSerialized(groupState2.mlsEpochState.get(1))

        expect(group1.secrets).toEqual(group2.secrets)
    })

    it("should handle wrong delivery messages", async function () {
        let message1 = {
            message_type: 0,
            mls_message: "This is complete garbage"
        }
        let message2 = {
            message_type: 1,
            mls_message: "Even more garbage"
        }

        let failure = false
        try {
            await MLSservice.handleMlsMessage(message1 as unknown as Delivery.Message, undefined, undefined)
        } catch (error) {
            failure = true
        }
        expect(failure).toBe(true)

        failure = false
        try {
            await MLSservice.handleMlsMessage(message2 as unknown as Delivery.Message, undefined, undefined)
        } catch (error) {
            failure = true
        }
        expect(failure).toBe(true)
    })

})

// Helper to create groups without sending welcome messages
function helper_create(platform: string, account_id: string, group_id: string, group_members: string[]): Promise<string> {
    return new Promise((resolve, _) => {
        KeyServer.getKeyPackageData(platform, account_id)
            .then((myKeypackageData) => {
                Promise.all(group_members.map(id => KeyServer.getKeyPackage(platform, id)))
                    .then(keypackages => MLSservice.createGroup(group_id, keypackages, myKeypackageData))
                    .then(([serializedGroup, mlsplaintext, welcomeBuffer]) => {
                        let welcome = bytesToBase64(welcomeBuffer)

                        let creationTime = new Date().getTime()

                        let message = {
                            src_account: account_id,
                            group_id: group_id,
                            message_type: 0,
                            creationTime: creationTime,
                            mls_message: welcome
                        }

                        return resolve(JSON.stringify(message))
                    })

            })
    })
}

const user_0_messages = []
const user_1_messages = []
const user_2_messages = []