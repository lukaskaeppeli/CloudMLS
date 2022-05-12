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

import { PBKDF2, SHA512 } from 'crypto-js';
import { BehaviorSubject } from 'rxjs';
import { axiosClient, CloudMLS } from '.';
import { AccountManager } from './accountManager';


export namespace Authentication {

  export let isAuthenticated: BehaviorSubject<boolean> = new BehaviorSubject<boolean>(null);


  export async function register(credentials: { username, password }): Promise<void> {
    return new Promise((resolve, reject) => {
      axiosClient.post(CloudMLS.servers.auth_server_url + "/auth/register", { username: credentials.username, password: credentials.password })
        .then(() => { return resolve() })
        .catch(error => { return reject(error) })
    })
  }

  export async function login(credentials: { username, password }): Promise<void> {
    return new Promise((resolve, reject) => {
      axiosClient.post(CloudMLS.servers.auth_server_url + "/auth/login", { username: credentials.username, password: credentials.password })
        .then(response => {

          // Derive keys and set local variables
          CloudMLS.keystore.set_username(credentials.username)
          CloudMLS.keystore.set_username_hash(SHA512(response.data["local_user_salt"] + credentials.username).toString())

          let keyserver_enc_key = PBKDF2(credentials.password, response.data["keyserver_key_salt"], { keySize: 512, iterations: 10 })
          let local_enc_key = PBKDF2(credentials.password, response.data["local_key_salt"], { keySize: 512, iterations: 10 })


          CloudMLS.keystore.set_encryption_key(keyserver_enc_key.toString())
          CloudMLS.keystore.set_local_key(local_enc_key.toString())

          isAuthenticated.next(true)

          // Set accounts
          AccountManager.setAccounts(response.data["accounts"])
            .then(() => { return resolve() })
        })
        .catch(error => { return reject(error) })
    })
  }

  export function logout(navigationCallback?: () => void): Promise<void> {
    return new Promise((resolve, _) => {
      AccountManager.destroy()
      CloudMLS.keystore.delete()
      axiosClient.post(CloudMLS.servers.auth_server_url + "/auth/logout")
        .catch(err => console.error(err))
        .then(() => {
          isAuthenticated.next(false);
          if (navigationCallback)
            navigationCallback()
          return resolve()
        })
    })
  }
}
