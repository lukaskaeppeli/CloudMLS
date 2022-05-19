# CloudMLS

[![NPM](https://nodei.co/npm/cloudmls.png)](https://nodei.co/npm/cloudmls/)

CloudMLS is a library that can be used to create an additional layer of security for existing cloud-based platforms.
This library enables end-to-end encryption while minimizing the required amount of trust in external infrastructures.
For detailed information, consider reading the [wiki](https://github.com/lukaskaeppeli/cloudmls/blob/master/docs/wiki.md).

## Instalation

## Example

## Don't forget


## API
In the following, we provide an overview of the methods that are intended to be used, when developping a client application. For a complete list, please consider reading the [complete API specs](/docs/api.md).

### Keystore (src/keystore.ts)  
-   `delete()`  
    Deleting all values stored.

-   `get_encryption_key()`  
    Get the encryption key for content on the key server.

-   `get_local_key()`  
    Get the encryption key for content stored locally.

-   `get_username()`  
    Get the username of the currently logged in user.

-   `get_username_hash()`  
    Get the hash of the user currently logged in.


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
-   `addAccount(platform: string, account_id: string)`  
    Called when a user associates a new third-party platform with its CloudMLS account. Creates a KeyPackage afterwards.

-   `updateKeyPackage(account: Account, forced?: boolean)`  
    Updates the keypackage for the specified account if there is none yet or it will expire in less than 7 days.

-   `destroy()`  
    Deleting the stored accounts.

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