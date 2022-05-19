### Keystore (src/keystore.ts)  
-   `delete()`  
    Deleting all values stored.

-   `get_encryption_key()`  
    Get the encryption key for content on the key server.

-   `set_encryption_key(value)`  
    Set the encryption key for content on the key server.

-   `get_local_key()`  
    Get the encryption key for content stored locally.

-   `set_local_key(value)`  
    Set the encryption key for content stored locally.

-   `get_username()`  
    Get the username of the currently logged in user.

-   `set_username(value)`  
    Get the username of the currently logged in user.

-   `get_username_hash()`  
    Get the hash of the user currently logged in.

-   `set_username_hash(value)`  
    Set the hash of the user currently logged in.


### Authentication Service (src/authentication.ts)
-   `isAuthenticated: BehaviorSubject<boolean>`  
    Boolean, indicating if there is a user authenticated.

-   `register(username: string, password: string)`  
    Register a new user to the CloudMLS key server.

-   `login(username: string, password: string)`  
    Perform login and then derive the keys using the salt values from the servers response. Additionally adds the with the user assotiated accounts to the AccountManager.

-   `logout(navigationCallback?: () => void)`  
    Logs out the currently logged in user and calls the optional navigationCallback afterwards.


### Account Manager (src/accountManager.ts)
-   `setAccounts(accounts: Account[])`  
    Sets the accounts of the currently logged in user.

-   `addAccount(platform: string, account_id: string)`  
    Called when a user associates a new third-party platform with its CloudMLS account. Creates a KeyPackage afterwards.

-   `updateKeyPackage(account: Account, forced?: boolean)`  
    Updates the keypackage for the specified account if there is none yet or it will expire in less than 7 days.

-   `createKeyPackage(account: Account)`  
    Creates a new keypackage for the specified account, issues update commits to each group in which the specified account is a member and posts the new keypackage to the keyserver.

-   `destroy()`  
    Deleting the stored accounts.

### Delivery Service (src/delivery.ts)
-   `fetchMessages(platform: string, account_id: string)`  
    Fetches all messages for the specified account from the delivery server. The delivery server then removes all messages such that they can not be fetched twice.

-   `storeMlsMessage(`  
    `   from: string, `  
    `   to: string, `  
    `   platform: string, `  
    `   group_id: string,`  
    `   message_type: MLS.MessageType, `  
    `   mls_message: string, `  
    `   creationTime: number `  
    `)`  
    Stores a message to be sent to the delivery server once sendAll() is called. The message itself will be sent as JSON.stringify(message) such that the server does not need to parse it.

-   `sendAll()`  
    Sends all messages from the messageStore at once. Therefore, the message store is copied such that new stored messages don't get deleted once the post request has finished.

-   `destroy()`  
    Delete stored messages.

### Group Service (src/groups.ts)
-   `update(`  
    `   platform: string, `  
    `   account_id: string, `  
    `   group_id: string, `  
    `   group_members: string[]`  
    `)`  
    Passive group management method. This method updates the MLS group datastructure according
    to the group state of the messenger platform. The updates are determined by comparing the
    members of the MLS group with the group members of the messenger platform. It also checks
    if for an existing group, an MLS group can be created by checking if every member has a 
    valid keypackage.

-   `createGroup(`  
    `   platform: string, `  
    `   account_id: string, `  
    `   group_id: string, `  
    `   group_members: string[]`  
    `)`  
    Active group management method. Creates a new group and sends the welcome messages to all members of that group. Finally uploads the resulting group state to the keyserver.

-   `addMembers(`  
    `   platform: string, `  
    `   account_id: string, `  
    `   group_id: string, `  
    `   newMember_ids: string[]`  
    `)`  
    Active group management method. First fetches all messages from the delivery server to have the most actual view of the corresponding group. Fetches the needed data from the keyserver, applies the specified adds and pushes the updated group states to the keyserver again. Also delivers the mls messages at the end.

-   `removeMembers(`  
    `   platform: string, `  
    `   account_id: string, `  
    `   group_id: string, `  
    `   oldMember_ids: string[]`  
    `)`  
    Active group management method. First fetches all messages from the delivery server to have the most actual view of the corresponding group. Fetches the needed data from the keyserver, applies the specified removals and pushes the updated group states to the keyserver again. Also delivers the mls messages at the end.

### Dialog Service (src/dialogs.ts)
-   `update(`  
    `   platform: string, `  
    `   account_id: string, `  
    `   group_id: string, `  
    `   group_members: string[]`  
    `)`  
    Same as update in the Group Service. Just a bit faster as just two parties are updated.

### KeyServer Service (src/keyserver.ts)
-   `getKeyPackage(platform: string, account_id: string)`  
    Request a specific keypackage from the Authentication Server.


-   `getKeyPackageData(platform: string, account_id: string)`  
    Request keypackage data. This data is stored as JSON.stringify(PackageData) on the keyserver and has therefore to be parsed before returned.

-   `updateKeyPackage(`  
    `   platform: string, `  
    `   account_id: string, `  
    `   keyPackageData: MLS.PackageData`  
    `   old_keypackage?: string`  
    `)`  
    Updates a keypackage on the authentication server and stores the corresponding keypackage data on the keyserver.

-   `getGroups(platform: string, account_id: string)`  
    Requests all groups of the specified platform in which the specified account is a member.

-   `getGroupState(`  
    `   platform: string, `  
    `   account_id: string, `  
    `   group_id: string, `  
    `)`  
    Requests a specific group state from the keyserver.

-   `postGroupState(`  
    `   account_id: string, `  
    `   platform: string, `  
    `   groupState: KeyServer.GroupState`  
    `)`  
    Posts the complete group state to the keyserver. No delta updates but complete replacement.


-   `removeOldStates(`  
    `   platform: string, `  
    `   account_id: string, `  
    `   group_id: string, `  
    `   epoch: number`  
    `)`
    The groupState.mlsEpochState data structure grows over time. Using this method old states are removed.


### Message Service (src/message.ts)
-   `encrypt(`  
    `   plaintext: string, `  
    `   platform: string, `  
    `   account_id: string, `  
    `   group_id: string`  
    `)`  
   Encrypts a message using the MLS data structure of the specified group. Therefore, the group state is fetched from the keyserver, used to encrypt the specified message. The resulting group state is afterwards serialized and stored on the keyserver again. If there is no group state on the keyserver, the message plaintext is returned.

-   `decrypt(`  
    `   ciphertext: string, `  
    `   date: number,`  
    `   platform: string, `  
    `   account_id: string, `  
    `   group_id: string, `  
    `)`  
   Decrypts a message using the MLS data structure of the specified group. Therefore, the group state is fetched from the keyserver, used to decrypt the specified message. The resulting group state is afterwards serialized and stored on the keyserver again, if the decryption changed the datastructure.

### MLS Service (src/mls-wrapper.ts)
-   `isKeyPackageValid(`  
    `   keypackage_bytes: Uint8Array, `  
    `   future_time?: number`  
    `)`  
    Decodes the keypackage and checks its signature. If the signature is valid, the Lifetime extension is checked and true is resolved, if the package is still valid.

-   `createKeyPackage(unique_user_id: string)`  
    Creates a KeyPackage as specified in Chapter 7. The default validity period is 30 days (1000 * 3600 * 24 * 30 milliseconds) from now on.

-   `createGroup(`  
    `   group_id: string,  `  
    `   keypackage_buffers: Uint8Array[],`  
    `   my_keypackage: MLS.PackageData`  
    `)`  
    Creates a new MLS group.

-   `commitUpdate(`  
    `   groupState: KeyServer.GroupState, `  
    `   newKeyPackageData: MLS.PackageData`  
    `)`  
    When a user updates its keypackage, this method creates the proposals to the other group members.

-   `generateUpdateMessages(`  
    `   newKeyPackages: Uint8Array[], `  
    `   leftMembers: string[],`  
    `   groupState: KeyServer.GroupState,`  
    `   my_keypackage: MLS.PackageData`  
    `)`  
    Generates Add and Remove proposals and directly calls commit() to return the corresponding ciphertext containting the commit, as well as the welcome messages for new members. The commit messages have to be sent to all group members and the welcome messages have to be sent to the new members.

-   `commit(`  
    `   groupState: KeyServer.GroupState,  `  
    `   my_keypackage: MLS.PackageData, `  
    `   proposals: Proposal[]`  
    `)`
    Commit an array of proposals.

-   `handleMlsMessage(`  
    `   message: Delivery.Message, `  
    `   my_keypackage: MLS.PackageData,`  
    `   groupState: KeyServer.GroupState`  
    `)`  
    Handles MLS specific messages received by the delivery service.

-   `encryptMessage(`  
    `   groupState: KeyServer.GroupState, `  
    `   message: string,`  
    `   keyPackageData: MLS.PackageData`  
    `)`  
    Encrypts a message for the specified group.

-   `decryptMessage(`  
    `   groupState: KeyServer.GroupState, `  
    `   message: string,`  
    `)`
    Decrypts a ciphertext using the provided group state.

### Main (index.ts)
-   `keystore: Keystore = new NonPerstistentKeystore()`  
    The default keystore keeps the values in memory. Set this variable with any alternative keystore that extends the abstract Keystore class.

-   `sessionExpiredCallback: (message: string) => void = (message: string) => console.error(message)`  
    Defines what the application should do when the session expires. Can be replaced by any callback.

-   `servers = {`
    `   key_server_url: "http://localhost:8080",`
    `   delivery_server_url: "http://localhost:8080",`
    `   auth_server_url: "http://localhost:8080"`
    `}`  
    The default adresses for the backends. Set these variables if you're not hosting the key server on localhost:8080.
