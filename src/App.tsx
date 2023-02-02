import React, { useState } from "react";
import "./App.css";
import { Wallet, getDefaultProvider, Signer, providers } from "ethers";
import { Database, Validator } from "@tableland/sdk";

// Provide a global `window` variable to (naively) prevent type errors when
// connecting to a browser wallet.
declare const window: any;

// Define a table schema——e.g., used if you want to strongly type `Database`.
interface TableSchema {
  id: number;
  name: string;
  block: string;
  tx: string;
}

/**
 * Create a connection with the base chain and return the `Signer`.
 *
 * @returns A `Signer`—the signing account (though a browser wallet connection
 * or private key).
 */
async function connect(): Promise<Signer | undefined> {
  /**
   * Connecting a signer using a browser wallet connection.
   *
   * For a browser wallet connections, prompt the user to sign the message. This
   * is the default behavior with `new Database()`, but for demonstration
   * purposes, an instance of `Signer` is passed to the database for table
   * creates & writes.
   *
   * If you'd like to connect using a private key, delete the code below and
   * uncomment the section below under "Connecting a signer using a private key".
   */
  // Establish a connection with the browser wallet's provider.
  const provider = new providers.Web3Provider(window.ethereum);
  // Request the connected accounts, prompting a browser wallet popup to connect.
  await provider.send("eth_requestAccounts", []);
  // Create a signer from the returned provider connection.
  const signer = provider.getSigner();
  // Return the signer
  return signer;

  /**
   * Connecting a signer using a private key.
   *
   * For a local wallet connection, create a signer using a private key stored
   * in `.env`. Note that `Wallet` is extension of `Signer`. `Wallet`
   * initializes with a private key, whereas `Signer` does not (signs a
   * message). `Wallet` has a few other methods available.
   *
   * The code below is commented out, but if you'd like to connect using a
   * private key, uncomment this and delete the code above for "Connecting a
   * signer using a browser wallet connection".
   */
  // // Import the private key, available in `.env. using `REACT_APP_` prefix.
  // const privateKey = process.env.REACT_APP_PRIVATE_KEY;
  // // Define the signer and connect to the provider.
  // let signer;
  // if (privateKey !== undefined) {
  //   const wallet = new Wallet(privateKey);
  // // A local Hardhat node from running `npx local-tableland`, but replace
  // // with any provider URL (e.g., Alchemy, Infura, Etherscan, etc.).
  //   const provider = getDefaultProvider("http://127.0.0.1:8545");
  //   signer = wallet.connect(provider);
  // }
}

/**
 * Create a table with a `prefix` value from a form input.
 *
 * @param signer The signing account for all transactions.
 * @param prefix A human readable table identifier (as part of a form input).
 * @returns Auto-generated table name, in the format `{prefix}_{chainId}_{tableId}`
 */
async function create(
  signer: Signer,
  prefix: string
): Promise<string | undefined> {
  // Establish a connection with the database and define the expected type.
  const db = new Database<TableSchema>({ signer });
  /**
   * Assign the `meta` values to `create` (metadata about the create action,
   * like duration, table name, etc.). Note: other response keys include
   * `success` (if the tx succeeded) and `results` (only for read queries,
   * otherwise, empty). Also note the schema is hardcoded as the following:
   *    id integer primary key, name text, block text, tx text
   * The `id integer primary key` can auto-increment when no value provided.
   */
  const { meta: create } = await db
    .prepare(
      `CREATE TABLE "${prefix}" (id integer primary key, name text, block text, tx text);`
    )
    .run();
  return create.txn?.name;
}

/**
 * Write to the table with a `name` value from a form input.
 *
 * @param signer The signing account for all transactions.
 * @param tableName Generated table name in the format
 * `{prefix}_{chainId}_{tableId}`.
 * @param name Table value to insert into the `name` column.
 * @returns Boolean value for if the write tx was successful.
 */
async function write(signer: Signer, tableName: string, name: string) {
  // Establish a connection with the database and define the expected type.
  const db = new Database<TableSchema>({ signer });
  // Assign the `meta` values to `write` (metadata about the write action, such
  // as tx hash). Notice the "magic" functions to automatically grab the chain's
  // `BLOCK_NUM()` and `TXN_HASH()`.
  const { success, meta: insert } = await db
    .prepare(
      `INSERT INTO ${tableName} (name, block, tx) VALUES (?, BLOCK_NUM(), TXN_HASH());`
    )
    .bind(name)
    .run();
  // Await the write tx's success.
  await insert.txn?.wait();
  // Upon a submitted transaction, the `success` field in the response object
  // will return a boolean.
  return success;
}

/**
 * Read from the created & mutated table on the selected chain.
 *
 * @param signer The signing account for all transactions (but only needed to
 * get the chain ID).
 * @param tableName Generated table name in the format
 * `{prefix}_{chainId}_{tableId}`.
 * @returns Table values, which are objects in an array.
 */
async function read(signer: Signer, tableName: string): Promise<TableSchema[]> {
  // Grab the chain ID from the connected signer.
  const chainId = await signer.getChainId();
  // Create a read-only connection to a single chain, where the `Database`
  // doesn't need a signer.
  const db = Database.readOnly(chainId);
  // Fetch the table data——the results are an array of table data (recall that
  // creates and writes have empty results).
  const { results } = await db
    .prepare(`SELECT * FROM ${tableName};`)
    .all<TableSchema>();
  // Return the array of results (a series of `TableSchema` objects).
  return results;
}

/**
 * A basic app with form inputs and table rendering.
 *
 * The setup is rather basic and not necessarily "best practice" for React, but
 * it gets the job done. A `signer` is saved to state upon an initial wallet
 * connection, along with the wallet's `address`. Then, a table is created where
 * its name is saved to `tableName`.
 *
 * Upon writing to a table, the success of the write tx is saved to
 * `writeSuccess`. This value is used for demo purposes with the `success`
 * Database response and used to disable the "Read" query button until data is
 * written to a table. Lastly, upon manually clicking a "Read" query button, the
 * table's data is saved to `data` and then rendered in a table within the UI.
 */
function App() {
  // Signer & associated account address data
  const [signer, setSigner] = useState<Signer | undefined>(undefined);
  const [address, setAddress] = useState<string>("");
  // Table related data upon creating, writing to, and reading from tables.
  const [tableName, setTableName] = useState<string | undefined>(undefined);
  const [writeSuccess, setWriteSuccess] = useState<boolean>(false);
  const [data, setData] = useState<TableSchema[]>([]);
  // Form related data that gets passed to Tableland `Database.prepare()`
  // methods.
  const [prefix, setPrefix] = useState<string>("");
  const [writeData, setWriteData] = useState<string>("");
  // A naive way of displaying a loader (imperfect w/ browser wallet rejects /
  // cancels.
  const [isLoading, setIsLoading] = useState<boolean>(false);

  // Handle form input data changes for the table's `prefix` and `write` data.
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
      {
        // Basic navbar with a wallet `Connect` button.
      }
      <nav>
        <h1>Getting started with Tableland</h1>
        {
          // If there is a signer established, render the button with the
          // signer's address. Else, show "Connect".
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
          // Once a signer is set via `connect()`, enable the create button.
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
          // Once a table name is set via `create()`, enable the write button.
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
              // Display the table name after it is created with `create()`.
              !tableName ? "No table created, yet." : <p>{tableName}</p>
            }
            {
              // Once data is written via `write()`, read from the table and set
              // `data`.
            }
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
          // Render the table data upon making `read()` calls by manually
          // clicking the read button (you could imagine polling, instead).
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
      {
        // Display a loading overlay upon various method calls (note: imperfect
        // logic in `isLoading`; wallet rejects will keep the spinner going).
      }
      {isLoading && <div id="loading"></div>}
    </>
  );
}

export default App;
