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

export namespace KeyServer {    
      export interface PackageData {
        keypackage: string,
        signingPrivateKey: string,
        signingPublicKey: string,
        hpkePrivateKey: string,
        hpkePublicKey: string,
        credential: string
      }
    
      export interface GroupState {
        group_id: string,
        members: Set<string>,
        creationTime: number,
        mlsEpochState: Map<number, string>,
        latestEpoch: number,
        updateCounter: number
      }
}


export namespace Delivery {
    export interface Message {
        src_account: string,
        group_id: string,
        message_type: number,
        creationTime: number,
        mls_message: string
      }
}


export namespace MLS {
    export interface PackageData {
        keypackage: Uint8Array,
        signingPrivateKey: Uint8Array,
        signingPublicKey: Uint8Array,
        hpkePrivateKey: Uint8Array,
        hpkePublicKey: Uint8Array,
        credential: Uint8Array
      }
    
      export enum MessageType {
        WELCOME = 0,
        COMMIT = 1
      }
}


