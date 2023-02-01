import React, { useState } from "react";
import "./App.css";
import { Wallet, getDefaultProvider, Signer, providers } from "ethers";
import { Database, Validator } from "@tableland/sdk";

// Provide a global `window` variable to (naively) prevent type errors
declare const window: any;

// Define a table schema——e.g., this is used if you want to strongly type `Database`
interface TableSchema {
  id: number;
  name: string;
  block: string;
  tx: string;
}

// Create a connection with the base chain and return the `Signer`
async function connect(): Promise<Signer | undefined> {
  /**
   * Connecting a signer using a private key
   *
   * For a local wallet connection, create a signer using a private key stored in `.env`
   * Note that `Wallet` is extension of `Signer`. `Wallet` initializes with a private key,
   * whereas `Signer` does not (signs a message). `Wallet` has a few other methods available.
   *
   * The code below is commented out, but if you'd like to connect using a private key,
   * uncomment this and delete the code under "Connecting a signer using a browser wallet connection"
   */
  // // Import the private key, made available in React using the `REACT_APP_` prefix
  // const privateKey = process.env.REACT_APP_PRIVATE_KEY;
  // // Define the signer and connect to the provider
  // let signer;
  // if (privateKey !== undefined) {
  //   const wallet = new Wallet(privateKey);
  //   const provider = getDefaultProvider("http://127.0.0.1:8545"); // A local Hardhat node from running `npx local-tableland`
  //   signer = wallet.connect(provider);
  // }

  /**
   * Connecting a signer using a browser wallet connection
   *
   * For a browser wallet connections, prompt the user to sign the message. This is
   * the default behavior with `new Database()`, but for demonstration purposes,
   * an instance of `Signer` is passed to the database for table creates & writes.
   *
   * If you'd like to connect using a private key, delete the code below and uncomment
   * the section above under "Connecting a signer using a private key"
   */
  // Establish a connection with the browser wallet's provider
  const provider = new providers.Web3Provider(window.ethereum);
  // Request the connected accounts, prompting a browser wallet popup to connect
  await provider.send("eth_requestAccounts", []);
  // Create a signer from the returned provider connection
  const signer = provider.getSigner();
  // Return the signer
  return signer;
}

// Create a table with a `prefix` value from a form input
async function create(
  signer: Signer,
  prefix: string
): Promise<string | undefined> {
  const db = new Database<TableSchema>({ signer });
  const { meta: create } = await db
    .prepare(
      `CREATE TABLE "${prefix}" (id integer primary key, name text, block text, tx text);`
    )
    .run();
  return create.txn?.name;
}

// Write to the table with a `name` value from a form input
async function write(signer: Signer, tableName: string, name: string) {
  const db = new Database<TableSchema>({ signer });
  const { success, meta: insert } = await db
    .prepare(
      `INSERT INTO ${tableName} (name, block, tx) VALUES (?, BLOCK_NUM(), TXN_HASH());`
    )
    .bind(name)
    .run();
  await insert.txn?.wait();
  return success;
}

// Read from the created & mutated table on the selected chain
async function read(signer: Signer, tableName: string): Promise<TableSchema[]> {
  const chainId = await signer.getChainId();
  console.log(chainId);
  const db = Database.readOnly(chainId);
  const { results } = await db
    .prepare(`SELECT * FROM ${tableName};`)
    .all<TableSchema>();
  return results;
}

// A basic app with form inputs and table rendering
function App() {
  // App data
  const [signer, setSigner] = useState<Signer | undefined>(undefined);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [address, setAddress] = useState<string>("");
  const [tableName, setTableName] = useState<string | undefined>(undefined);
  const [writeSuccess, setWriteSuccess] = useState<boolean>(false);
  const [data, setData] = useState<TableSchema[]>([]);
  // Form data
  const [prefix, setPrefix] = useState<string>("");
  const [writeData, setWriteData] = useState<string>("");

  // Handle form input data change
  function handleChange(e: any) {
    switch (e.target.name) {
      case "prefix":
        setPrefix(e.target.value);
        break;
      case "writeData":
        setWriteData(e.target.value);
        break;
      default:
        break;
    }
  }

  return (
    <>
      {/* Basic navbar with wallet `Connect` button */}
      <nav>
        <h1>Getting started with Tableland</h1>
        {
          // If there is a signer established, render the button with the signer's address
          <div>
            <button
              type="button"
              onClick={async () => {
                const s = await connect();
                const a = await s!.getAddress();
                setSigner(s);
                setAddress(a);
              }}
            >
              {address ? address.slice(0, 6) + "..." : "Connect"}
            </button>
          </div>
        }
      </nav>
      <div className="container">
        <h2>Interact with the database</h2>
        {
          // Once a signer is set via `connect()`, enable the create button
          <>
            <form>
              <input
                onChange={handleChange}
                name="prefix"
                placeholder="Table prefix (e.g., my_table)"
                disabled={signer ? false : true}
              ></input>
              <button
                onClick={async (e) => {
                  e.preventDefault();
                  setIsLoading(true);
                  if (signer) {
                    const n = await create(signer, prefix);
                    setTableName(n);
                  }
                  setIsLoading(false);
                }}
                disabled={signer ? false : true}
              >
                Create
              </button>
            </form>
          </>
        }
        {
          // Once a table name is set via `create()`, enable the write button
          <>
            <form>
              <input
                onChange={handleChange}
                name="writeData"
                placeholder="Bobby Tables"
                disabled={signer && tableName ? false : true}
              ></input>
              <button
                onClick={async (e) => {
                  e.preventDefault();
                  setIsLoading(true);
                  if (signer && tableName) {
                    const isSuccess = await write(signer, tableName, writeData);
                    setWriteSuccess(isSuccess);
                  }
                  setIsLoading(false);
                }}
                disabled={signer && tableName ? false : true}
              >
                Write
              </button>
            </form>
            <h5>
              Schema is hardcoded for demo purposes:{" "}
              <i>id integer primary key, name text, block text, tx text</i>
            </h5>
            <h3>Table name</h3>
            {
              // Display the table name after it is created with `create()`
              !tableName ? "No table created, yet." : <p>{tableName}</p>
            }
            {/* Once data is written via `write()`, read from the table and set the app's state `data` */}
            <div>
              <h3>↓ Read from the table</h3>
              <button
                type="button"
                onClick={async () => {
                  setIsLoading(true);
                  if (signer && tableName) {
                    const d = await read(signer, tableName);
                    setData(d);
                  }
                  setIsLoading(false);
                }}
                disabled={!writeSuccess}
              >
                Read
              </button>
            </div>
          </>
        }
        <h2>Table data</h2>
        {
          // Render the table data upon making `read()` calls from the read button
          data.length === 0 ? (
            <p>
              No data is written, yet—or you haven't clicked <b>Read</b>.
            </p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>id</th>
                  <th>name</th>
                  <th>block</th>
                  <th>transaction hash</th>
                </tr>
              </thead>
              <tbody>
                {data.map((d) => (
                  <tr key={d.id}>
                    <td>{d.id}</td>
                    <td>{d.name}</td>
                    <td>{d.block}</td>
                    <td>{d.tx}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )
        }
      </div>
      {/* Display a loading overlay upon various method calls (note: imperfect logic is `isLoading`) */}
      {isLoading && <div id="loading"></div>}
    </>
  );
}

export default App;
