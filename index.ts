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

import axios, { AxiosInstance } from 'axios';
import { Keystore, NonPerstistentKeystore } from './src/keystore';


export namespace CloudMLS {

  export let keystore: Keystore = new NonPerstistentKeystore()
  export let sessionExpiredCallback: (message: string) => void = (message: string) => console.error(message)

  export let servers = {
    key_server_url: "http://localhost:8080",
    delivery_server_url: "http://localhost:8080",
    auth_server_url: "http://localhost:8080"
  }
}

export const axiosClient: AxiosInstance = axios.create({
  headers: { 'Content-Type': 'application/json' },
  withCredentials: true
})

axiosClient.interceptors.response.use(
  (response) => {
    return response
  },

  (error) => {
    const originalRequest = error.config;
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;
      axios.post(CloudMLS.servers.auth_server_url + "/auth/refresh")
        .then(() => {
          return axiosClient(originalRequest);
        }).catch(() => {
          CloudMLS.sessionExpiredCallback("Session expired, please login again")
        })
    }
    return Promise.reject(error);
  }
);