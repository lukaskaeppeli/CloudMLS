- [ ] **Security and Performance:**
There is a large potential for improvements to the CloudMLS library as
well as for the underlying MLS implementation from Hubert Chathi. Both
libraries are still not implemented completely nor were any performance
optimizations made. In terms of security, both the implementations
themselves and the imported Node.js packages need to be analyzed to rule
out security vulnerabilities.

- [ ] **Epoch Base Ratchets:**
In a previous version of our library, we have only stored the most
recent group state on the key server. The problem thereby was that users
that were offline during two or more group updates could not decrypt
messages sent in between these updates. More formally, if a user has
seen the group at epoch *x*, and is then offline until epoch *x* + 2,
the user will never be able to decrypt messages from epoch *x* + 1.
In this previous version, instead of storing each group state, we simply
stored the first hash ratchet of each member of the group. From this
ratchet, all subsequent keys were derived. Thus, to reduce the number of
group states on the key server, we could re-add these epoch base
ratchets and find some way to determine when we can delete past group
states.

- [ ] **Enable native devices:**
As we have aimed for a browser-compatible implementation of our library,
there currently exists a lack of support for native applications. The
problem is that the access tokens that are sent as cookies, which do
only work in a browser. To support native devices, the following
requirements must be met:

  -   **Key server:** Upon successful login, the tokens must be sent
    inside an HTTP-only cookie as well as in the response body. This is
    already implemented.

  -   **Key server:** When receiving a request, do not only search the
    token in the cookies but also in the request itself.

  -   **Key server:** When refreshing the tokens, send the resulting
    tokens back as a cookie and inside the response body.

  -   **CloudMLS:** When receiving the tokens from the key server, either
    due to a login or refresh request, store them in memory. If the
    client application provided some form of persistent `KeyStore`, we
    may store the tokens in it.

  -   **CloudMLS:** Add an additional axios interceptor, adding the token
    to each request. It may be beneficial to filter the URLs for which
    the tokens are useless, like refresh, login, and registration
    requests.

- [ ] **Changing the password:**
As we are using a password-based encryption scheme to encrypt data
stored on the key server and possibly in local storage, changing the
password is a non-trivial task. Changing the password does therefore
also require to re-encrypt local and remote data structures, which is an
approach that does not scale. An alternative would be to generate a
random key that is used to encrypt these data structures and then
encrypt this random key using the password-based encryption scheme.
Concerning performance, this approach would be very efficient as
changing the password only requires the re-encryption of one element. On
the other side, changing the password does not change the encryption
keys. We could, however, provide a method that allows a user to
re-encrypt the complete content on the key server.

- [ ] **Public key cryptography:**
We do only support symmetric key cryptography for the encryption of data
on the key server. It is absolutely possible to allow a user to encrypt
the data structures using asymmetric cryptography. The resulting E2EE
would, however, not be a cloud-based approach. A user accessing his
account on a new device or in a browser would have to provide his
private key in some way. This could only be achieved if the user is
online with a primary device at the same time, resembling a two-factor
authentication or WhatsApp-like approach. Despite the disadvantages, a
user should have the choice of how he wants to secure his data.

- [ ] **Adapt to draft-13:**
At the beginning of March, the IETF working group developing the MLS
protocol published draft version 13 of the protocol. While version
twelve of the draft did not force us to adapt our implementation,
version 13 has an important change in it. In our implementation of the
library, when a user updates his KeyPackage, he creates an `Update`
proposal that he commits directly. This self-update is forbidden as of
version 13 and we have to change our approach. It therefore requires a
third MLS message type for proposal messages, which should be enabled in
the delivery service and the `handleMlsMessage()` function. The user
updating his `KeyPackage` then sends an `Update` proposal to all other
members of a group, from which anyone then issues a commit incorporating
this proposal. The most complex change will be to determine if a
received proposal was already included in a commit. An idea for solving
this issue is, to iterate through all received messages and filter out
proposals incorporated in a recent `Commit`, if such a `Commit` exists.
The draft version 13 does also specify that a `KeyPackage` should only
be used once to add a client to a group. This implies some changes to
our implementations. We first have to differentiate calls requesting a
`KeyPackage` itself from calls just verifying that there is a valid
`KeyPackage`. Then the authentication server must be able to verify the
validity of KeyPackages. We may further provide the possibility to
upload multiple KeyPackages per `Account` such that reusing the same
`KeyPackage` could be minimized.

- [ ] **Custom key server:**
The current implementation of the key server incorporates all three
functionalities, the key store, the delivery server, and the
authentication server. The next step in the development of this project
should be to implement a version of the key store that can be run by
individuals. This step involves creating a mechanism ensuring
consistency between the key server and the authentication and delivery
server. Besides consistency, the question of how authentication and
authorization on the custom key server can be handled arises. As the
main motivation for a self-hosted key server is reducing the amount of
trust in external infrastructures, it does not make any sense to let the
authentication server handle access to the user’s key server.
A simple way of achieving this separation could be to perform
registration and login requests twice, one to each server. Despite a
small overhead, this approach would perfectly split up the two services.
The next question arising is then how a user could switch from one to
another key server. We leave this question up for future work.

- [ ] **Space efficiency:**
We currently store the group states as an encrypted version of a
serialized JSON object. The approach of using JSON objects has the
disadvantage that the field identifiers are included in the
serialization introducing an overhead. The `Group` and `RatchetTreeView`
data structures store redundant data, which is not beneficial in terms
of storage efficiency as well. Using our approach, we do, however, only
store data in the order linear to the number of group mutations and
KeyPackage updates. This is already a huge improvement compared to
storing data linear to the number of messages sent. Nevertheless, there
is room for improvements in terms of the amount of storage required.

- [ ] **Check comments:** Verify that function documentation
    comments still match the behavior of the method itself.

- [ ] **Delete delivered messages manually:** Currently, we
    delete MLS-specific messages from the inbox once the client has
    fetched them. We should, however, keep the messages until the client
    has confirmed to successfully have applied the resulting changes. We
    could implement this by adding some form of counter to each message
    and then let the library confirm the latest message that could be
    deleted on the delivery server.

- [ ] **User Accounds:** Find out how to prevent a user from adding an Account
    that does not belong to him.