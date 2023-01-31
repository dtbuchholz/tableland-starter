import React, { useState } from "react";
import "./App.css";
import { Wallet, getDefaultProvider, Signer, providers } from "ethers";
import { Database } from "@tableland/sdk";

declare const window: any;

interface TableSchema {
  id: number;
  name: string;
}

async function connect(): Promise<Signer | undefined> {
  /**
   * For a private key stored in `.env`, create a signer using the key (Wallet is extension of Signer)
   */
  // const privateKey = process.env.REACT_APP_PRIVATE_KEY;
  // let signer;
  // if (privateKey !== undefined) {
  //   const wallet = new Wallet(privateKey);
  //   const provider = getDefaultProvider("http://127.0.0.1:8545");
  //   signer = wallet.connect(provider);
  // }

  /**
   * For browser wallet connections, prompt the user to sign the message
   */
  const provider = new providers.Web3Provider(window.ethereum);
  await provider.send("eth_requestAccounts", []);
  const signer = provider.getSigner();
  return signer;
}

async function create(signer: Signer): Promise<string | undefined> {
  const db = new Database<TableSchema>({ signer });
  const prefix: string = "my_sdk_table";
  const { meta: create } = await db
    .prepare(`CREATE TABLE ${prefix} (id integer primary key, name text);`)
    .run();
  console.log(create);
  return create.txn?.name;
}

async function write(signer: Signer, name: string) {
  const db = new Database<TableSchema>({ signer });
  const { meta: insert } = await db
    .prepare(`INSERT INTO ${name} (name) VALUES (?);`)
    .bind("Bobby Tables")
    .run();
  await insert.txn?.wait();
  console.log(insert);
}

async function read(signer: Signer, name: string): Promise<TableSchema[]> {
  const db = new Database<TableSchema>({ signer });
  const { results } = await db.prepare(`SELECT * FROM ${name};`).all();
  return results;
}

function App() {
  const [signer, setSigner] = useState<Signer | undefined>(undefined);
  const [name, setName] = useState<string | undefined>(undefined);
  const [data, setData] = useState<TableSchema[] | []>([]);

  return (
    <div className="App">
      {!signer && (
        <button
          onClick={async () => {
            const s = await connect();
            setSigner(s);
          }}
        >
          Connect
        </button>
      )}
      {signer && !name && (
        <>
          <button
            onClick={async () => {
              const n = await create(signer);
              setName(n);
            }}
          >
            Create
          </button>
        </>
      )}
      {signer && name && (
        <>
          <button onClick={async () => await write(signer, name)}>Write</button>
          <button
            onClick={async () => {
              const d = await read(signer, name);
              setData(d);
            }}
          >
            Read
          </button>
          {data &&
            data.map((d) => (
              <div key={d.id}>
                <span>{d.id}, </span>
                <span>{d.name}</span>
              </div>
            ))}
        </>
      )}
    </div>
  );
}

export default App;
