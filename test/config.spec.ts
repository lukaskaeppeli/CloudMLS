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
interface User {
    username: string,
    password: string,
    accounts: Record<string, string>
}

export const platforms = ["telegram", "whatsapp"]

export const users: User[] = [
    {
        username: "testuser_0",
        password: "testuser_0",
        accounts:
        {
            "telegram": "t_user_0",
            "whatsapp": "w_user_0"
        },

    },
    {
        username: "testuser_1",
        password: "testuser_1",
        accounts:
        {
            "telegram": "t_user_1",
            "whatsapp": "w_user_1"
        },

    },
    {
        username: "testuser_2",
        password: "testuser_2",
        accounts:
        {
            "telegram": "t_user_2",
            "whatsapp": "w_user_2"
        },

    },
    {
        username: "testuser_3",
        password: "testuser_3",
        accounts:
        {
            "telegram": "t_user_3",
            "whatsapp": "w_user_3"
        },

    },
    {
        username: "testuser_4",
        password: "testuser_4",
        accounts:
        {
            "telegram": "t_user_4",
            "whatsapp": "w_user_4"
        },

    },
    {
        username: "testuser_5",
        password: "testuser_5",
        accounts:
        {
            "telegram": "t_user_5",
            "whatsapp": "w_user_5"
        },

    },
]

export const groups: Record<string, string[]> = {
    "telegram1": [users[0].accounts["telegram"], users[1].accounts["telegram"], users[2].accounts["telegram"]],
    "telegram2": [users[0].accounts["telegram"], users[1].accounts["telegram"], users[2].accounts["telegram"]],
    "whatsapp1": [
        users[0].accounts["whatsapp"], users[1].accounts["whatsapp"], users[2].accounts["whatsapp"],
        users[3].accounts["whatsapp"], users[4].accounts["whatsapp"], users[5].accounts["whatsapp"]
    ],
    "whatsapp2": [
        users[0].accounts["whatsapp"], users[1].accounts["whatsapp"], users[2].accounts["whatsapp"],
        users[3].accounts["whatsapp"], users[4].accounts["whatsapp"], users[5].accounts["whatsapp"]
    ],
    "whatsapp3": [
        users[0].accounts["whatsapp"], users[1].accounts["whatsapp"], users[2].accounts["whatsapp"]
    ],
    "whatsapp4": [
        users[0].accounts["whatsapp"], users[1].accounts["whatsapp"], users[2].accounts["whatsapp"]
    ]
}
