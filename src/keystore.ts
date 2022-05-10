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

export abstract class Keystore {

  public abstract delete();

  public abstract get_encryption_key();
  public abstract set_encryption_key(value);

  public abstract get_local_key();
  public abstract set_local_key(value);

  public abstract get_username();
  public abstract set_username(value);

  public abstract get_username_hash();
  public abstract set_username_hash(value);

}

/**
 * Seems like an useless class, but prevents from using localStorage,
 * which is vulnerable to XSS attacks.
 */
export class NonPerstistentKeystore extends Keystore {

  private encryption_key = "";
  private local_key = "";
  private username = "";
  private username_hash = "";

  constructor() { 
    super()
  }


  public get_encryption_key() {
    return this.encryption_key;
  }
  public set_encryption_key(value) {
    this.encryption_key = value;
  }


  public get_local_key() {
    return this.local_key;
  }
  public set_local_key(value) {
    this.local_key = value;
  }


  public get_username() {
    return this.username;
  }
  public set_username(value) {
    this.username = value;
  }

  public get_username_hash() {
    return this.username_hash;
  }
  public set_username_hash(value) {
    this.username_hash = value;
  }


  delete() {
    this.encryption_key = undefined
    this.local_key = undefined
    this.username = undefined
    this.username_hash = undefined
  }

}
