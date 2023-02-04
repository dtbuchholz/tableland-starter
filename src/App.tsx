import { useEffect, useState, useCallback } from "react";
// For private key connections, you'll need `Wallet` & `getDefaultProvider`.
// For browser wallet connections, only `Signer` & `providers` are needed.
import { Wallet, getDefaultProvider, Signer, providers } from "ethers";
import { Database, Validator, Registry, helpers } from "@tableland/sdk";
import "./App.css";

// Note: This tutorial does not necessarily exhibit best practices with but
// demonstrates how to use the Tableland SDK and its various APIs.

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
 * Using other popular libraries (e.g., wagmi) can be used, instead, so that you
 * don't have to implement logic like this yourself.
 *
 * @returns The signing account (though a browser wallet connection or private
 * key).
 */
async function connect(): Promise<Signer> {
  // Connecting a signer using a browser wallet connection.
  //
  // For a browser wallet connections, prompt the user to sign the message. This
  // is the default behavior with `new Database()`, but for demonstration
  // purposes, an instance of `Signer` is passed to the database for table
  // creates & writes.
  //
  // If you'd like to connect using a private key, delete the code below and
  // uncomment the section below under "Connecting a signer using a private key."

  // Establish a connection with the browser wallet's provider.
  const provider = new providers.Web3Provider(window.ethereum);
  // Request the connected accounts, prompting a browser wallet popup to connect.
  await provider.send("eth_requestAccounts", []);
  // Create a signer from the returned provider connection.
  const signer = provider.getSigner();
  // Return the signer
  return signer;

  //  Connecting a signer using a private key.
  //
  // For a local wallet connection, create a signer using a private key stored
  // in `.env`. Note that `Wallet` is extension of `Signer`. `Wallet`
  // initializes with a private key, whereas `Signer` does not (signs a
  // message). `Wallet` has a few other methods available, too.
  //
  // The code below is commented out, but if you'd like to connect using a
  // private key, uncomment this and delete the code above for "Connecting a
  // signer using a browser wallet connection."

  // // Import the private key, available in `.env. using `REACT_APP_` prefix.
  // const privateKey = process.env.REACT_APP_PRIVATE_KEY;
  // // Define the signer and connect to the provider.
  // const wallet = new Wallet(privateKey!);
  // // A local Hardhat node from running `npx local-tableland`, but replace
  // // with any provider URL (e.g., Alchemy, Infura, Etherscan, etc.).
  // const provider = getDefaultProvider("http://127.0.0.1:8545");
  // const signer = wallet.connect(provider);
  // // Return the signer
  // return signer;
}

/**
 * Create a table with a `prefix` value from a form input.
 *
 * @param signer The signing account for all transactions.
 * @param prefix A human readable table identifier (as part of a form input).
 * @returns Auto-generated table name, in the format
 * `{prefix}_{chainId}_{tableId}`, as well as the table schema.
 */
async function create(
  signer: Signer,
  prefix: string
): Promise<{
  tableName: string;
  schema: string[];
}> {
  // Establish a connection with the database. Here, we'll be doing some extra
  // setup to then use the `Validator` API down below. To do so, we'll need to
  // pass a `baseUrl` that allows us to connect directly to the Tableland
  // network (validator node) and look up table info. The first step is to grab
  // the `chainId` and then use the `helpers` method to connect to either a
  // Tableland local, testnets, or mainnets node.
  const chainId = await signer.getChainId();
  const db = new Database({
    signer,
    baseUrl: helpers.getBaseUrl(chainId),
  });
  // Assign the `meta` values to `create` (metadata about the create action,
  // like duration, table name, etc.). Note: other response keys include
  // `success` (if the tx succeeded) and `results` (only for read queries,
  // otherwise, empty). Also note the schema is hardcoded as the following:
  //    id integer primary key, name text, block text, tx text
  // The `id integer primary key` will auto-increment when no value is provided.
  const { meta: create } = await db
    .prepare<TableSchema>(
      `CREATE TABLE "${prefix}" (id integer primary key, name text, block text, tx text);`
    )
    .run();
  // Call `wait()` to await the tx to complete, then, grab the table's
  // auto-generated name (`{prefix}_{chainId}_{tableId}`) and ID.
  await create.txn?.wait();
  const { tableId, name: tableName } = create.txn!;
  // Next, we'll demonstrate how to use the Tableland SDK's validator API.
  // Create a connection to a Tableland `Validator` on the chain ID to look up
  // table information, such as the table's schema. (Pretend we don't already
  // know the schema and need to look it up.)
  const validator = new Validator(db.config);
  const tableInfo = await validator.getTableById({
    chainId,
    tableId,
  });
  // A table's `schema` is an object with keys `name`, `type`, and
  // `constraints`. Convert this object into a single string for each column.
  const schema = tableInfo.schema.columns.map((col) => {
    return `${col.name} ${col.type} ${col.constraints ? col.constraints : ""}`;
  });
  // Return the table name and its per-column schema.
  return { tableName, schema };
}

/**
 * Write to the table with a `name` value from a form input.
 *
 * @param signer The signing account for all transactions.
 * @param tableName Generated table name in the format
 * `{prefix}_{chainId}_{tableId}`.
 * @param name Table value to insert into the `name` column.
 * @returns A pending write query transaction hash.
 */
async function write(
  signer: Signer,
  tableName: string,
  name: string
): Promise<string> {
  // Establish a connection with the database and define the expected type.
  const db = new Database<TableSchema>({ signer });
  // Assign the `meta` values to `write` (metadata about the write action, such
  // as tx hash). Notice the "magic" functions to automatically grab the chain's
  // `BLOCK_NUM()` and `TXN_HASH()`.
  const { meta: insert } = await db
    .prepare<TableSchema>(
      `INSERT INTO ${tableName} (name, block, tx) VALUES (?, BLOCK_NUM(), TXN_HASH());`
    )
    .bind(name)
    .run();
  // Return the (pending) tx hash
  return insert.txn!.transactionHash;
}

/**
 * Read from the created & mutated table on the selected chain.
 *
 * @param chainId The chain ID of the connected chain.
 * @param tableName Generated table name in the format
 * `{prefix}_{chainId}_{tableId}`.
 * @returns Table values, which are objects in an array.
 */
async function read(
  chainId: number,
  tableName: string
): Promise<TableSchema[]> {
  // Create a read-only connection to a single chain, where the `Database`
  // doesn't need a signer and only the chain where values exist.
  const db = Database.readOnly(chainId);
  // Fetch the table data——the results are an array of table data (recall that
  // creates and writes have empty results).
  const { results } = await db
    .prepare<TableSchema>(`SELECT * FROM ${tableName};`)
    .all();
  // Return the array of results (a series of `TableSchema` objects).
  return results;
}

/**
 * A basic app with form inputs and table rendering.
 *
 * The setup is rather simple & not necessarily "best practices" for React, but
 * it gets the job done. A `signer` is saved to state upon an initial wallet
 * connection, along with the wallet's `address` & `chainId`. Then, a table is
 * created where its name & schema are saved to `tableName` & `schema`.
 *
 * Upon writing to a table, the tx hash of write query is saved to
 * `pendingWriteTx`. This value is used as part of the polling process to read
 * table data and is also used to disable the "Read" query button until data is
 * written to a table. Various info (`rowCount` & `tablesOwnedCount`) is also
 * fetched for demo purposes with read queries and also using the Registry API.
 * There are also a couple of form-related state is also tracked when a user
 * sets the table `prefix` or `writeData`.
 *
 * A few callback hooks are used to set / unset the pending write tx, fetch (or
 * reset) table data, or retrieve a count of total owned tables. There's an
 * interesting `useEffect` with polling for a tx to finalize
 * (`pollForReceiptByTransactionHash`). Lastly, a number of handlers are used
 * to help with form data changes / submits.
 */
function App() {
  // Track the signer——but note that using external libraries & hooks (e.g.,
  // wagmi) can help circumvent needing to implement your own wallet logic.
  const [signer, setSigner] = useState<Signer>();
  // Use the address for a misc. UI feature, and chain ID helps with connecting
  // to Tableland.
  const [address, setAddress] = useState<string>();
  const [chainId, setChainId] = useState<number>();
  // Table (or general account) related data upon creating, writing to, and
  // reading from tables.
  const [tableName, setTableName] = useState<string>();
  const [schema, setSchema] = useState<string[]>([]);
  const [data, setData] = useState<TableSchema[]>([]);
  const [rowCount, setRowCount] = useState<number>();
  const [tablesOwnedCount, setTablesOwnedCount] = useState<number>();
  // Form related data that gets passed to Tableland `Database.prepare()`
  // methods. The prefix & write data *can* each be an empty string.
  const [prefix, setPrefix] = useState<string>("");
  const [writeData, setWriteData] = useState<string>("");
  // A naive way of displaying a loader (imperfect w/ browser wallet rejects /
  // cancels) using `isLoading`; `pendingWriteTx` will handle wallet rejects.
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [pendingWriteTx, setPendingWriteTx] = useState<string>();

  // When a write tx is made, the `pendingWriteTx` is set. This resets the tx
  // and also triggers a read query to update the `data`, rendered in the UI.
  const clearPendingTxAndRefresh = useCallback(async () => {
    setPendingWriteTx(undefined);
    const data = await read(chainId!, tableName!);
    setData(data);
  }, [chainId, tableName, setPendingWriteTx]);

  // When a new table is created, reset the table data and row count.
  const resetTableData = useCallback(async () => {
    setData([]);
    setRowCount(undefined);
  }, [tableName]);

  // Upon the signer connecting, get a count of all owned tables and continually
  // update the count wih new table creates.
  const getOwnedTables = useCallback(async () => {
    if (signer) {
      // Connect to the registry smart contract and look up owned tables by
      // singer address.
      const db = new Database({
        signer,
        baseUrl: helpers.getBaseUrl(chainId!),
      });
      const registry = new Registry(db.config);
      // Call `listTables()` that retrieves some aggregated ownership data from
      // the registry contract.
      const ownedTables = await registry.listTables(); // Default will use connected account.
      // Filer down `ownedTables`, which contains table IDs and its chain ID.
      const tableIds = ownedTables.map((t) => t.tableId);
      setTablesOwnedCount(tableIds.length);
    }
  }, [signer]);

  // Use the `resetTableData` callback to reset the table data displayed as well
  // as update the count of owned tables with `getOwnedTables`.
  useEffect(() => {
    resetTableData();
    getOwnedTables();
  }, [resetTableData, getOwnedTables]);

  // Upon pending write transactions (set by `handleWrite` & `write`), poll for
  // the tx receipt. Once the validator confirms the receipt, that means the
  // write tx was seen by the Tableland validator. Thus, if the write tx was
  // successful, then the table data has changed, which is a nice trigger to
  // then go fetch new table data and update state accordingly.
  useEffect(() => {
    if (pendingWriteTx) {
      // Connect to the Tableland database, where the chain ID defines the base URL.
      const db = new Database({
        signer,
        baseUrl: helpers.getBaseUrl(chainId!),
      });
      // Connect to a Tableland validator node (used for some specific APIs)
      const validator = new Validator(db.config);
      // Create a controller & signal to help abort the pending tx request, once
      // it is fulfilled.
      const controller = new AbortController();
      const signal = controller.signal;
      // Poll the validator on a specific chain at a specific tx hash, where the
      // `interval` is in milliseconds. Then, clear the pending tx from state.
      validator
        .pollForReceiptByTransactionHash(
          {
            chainId: chainId!,
            transactionHash: pendingWriteTx!,
          },
          { interval: 500, signal }
        )
        .then((_) => {
          clearPendingTxAndRefresh();
        })
        .catch((_) => {
          clearPendingTxAndRefresh();
        });
      return () => {
        controller.abort();
      };
    }
  }, [chainId, pendingWriteTx, clearPendingTxAndRefresh]);

  // Handle click for connecting an account and setting the `signer`,
  // using that to set the `address` and `chainId`. These are used
  // throughout various methods, particularly, the `Database`.
  async function handleConnect() {
    // Connect a signer
    const signer = await connect();
    const addr = await signer!.getAddress();
    const chainId = await signer.getChainId();
    setSigner(signer);
    setAddress(addr);
    setChainId(chainId);
  }

  // Handle form input data changes for the table's `prefix` and `writeData`.
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

  // Handle click for creating a table, which captures the generated `tableName`
  // and then fetches the table's schema directly from a Tableland validator.
  // The loading is rather naive but demonstrates a different way of achieving
  // this, as opposed to the `handleWrite` type of logic w/ `setPendingWriteTx`.
  async function handleCreate(e: any) {
    e.preventDefault();
    setIsLoading(true);
    if (signer) {
      try {
        // Create a table
        const { tableName, schema } = await create(signer, prefix);
        setTableName(tableName);
        setSchema(schema);
      } catch {
        setIsLoading(false);
      }
    }
    setIsLoading(false);
  }

  // Handle click for writing to the table, and upon success, set
  // `setPendingWriteTx`. This will then go through a polling workflow where,
  // upon the validator successfully seeing the tx, the table's data will be
  // fetched, and the `pendingWriteTx` will be cleared.
  async function handleWrite(e: any) {
    e.preventDefault();
    // Make a write query
    const tx = await write(signer!, tableName!, writeData);
    setPendingWriteTx(tx);
  }

  // Handle click for reading from the table, which updates the `rowCount`. This
  // is demonstrated for simple "manual" fetch vs. the polling option shown
  // above with the validator's `pollForReceiptByTransactionHash`.
  async function handleRead() {
    setIsLoading(true);
    // Read table data
    const data = await read(chainId!, tableName!);
    setRowCount(data.length);
    setIsLoading(false);
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
            <button type="button" onClick={handleConnect}>
              {address ? address.slice(0, 6) + "..." : "Connect"}
            </button>
          </div>
        }
      </nav>
      <div className="container">
        <div className="row">
          <div className="col">
            <h2>Interact with the database</h2>
            <p>Create a table and write to a single table cell.</p>
            {
              // Once a signer is set via `connect()`, enable the create button.
              <form>
                <input
                  onChange={handleChange}
                  name="prefix"
                  placeholder="Table prefix (e.g., my_table)"
                  disabled={signer ? false : true}
                ></input>
                <button onClick={handleCreate} disabled={signer ? false : true}>
                  Create
                </button>
              </form>
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
                    onClick={handleWrite}
                    disabled={signer && tableName ? false : true}
                  >
                    Write
                  </button>
                </form>
                <h5>Note—schema is hardcoded for demo purposes.</h5>
                {
                  // Once data is written via `write()`, read from the table to set
                  // and render the table's # of rows in the UI.
                }
                <div>
                  <h3>Read from the table</h3>
                  <p>
                    Fetch the total number of rows manually (displayed over in{" "}
                    <b>Table info</b>), instead of polling and automatically
                    updating data—which is what the <b>Table data</b> section
                    below does.
                  </p>
                  <button
                    type="button"
                    onClick={handleRead}
                    disabled={data.length === 0}
                  >
                    Read
                  </button>
                </div>
              </>
            }
          </div>
          <div className="col">
            <h2>Table info</h2>
            <div>
              {" "}
              <p>
                <b>Name: </b>
                {
                  // Display the table name after it is created with `create()`.
                  !tableName ? "No table created." : `${tableName}`
                }
              </p>
            </div>
            <div>
              {" "}
              <b>Schema:</b>
              {
                // Display the table schema after it is created with `create()`,
                // which actually gets fetched thereafter as part of the
                // response through a validator API call (`getTableById()`).
              }
              <ul>
                {schema.length === 0 ? (
                  <li>No table schema exists.</li>
                ) : (
                  schema.map((col) => <li key={col}>{col}</li>)
                )}
              </ul>
            </div>
            <div>
              <p>
                <b># of rows: </b>
                {
                  // Fetch & show the row count once a user clicks "Read".
                  !rowCount ? "No rows." : `${rowCount}`
                }
              </p>
            </div>
            <hr />
            <div>
              <p>
                <b># of created tables: </b>
                {
                  // Fetch & update the # of owned tables after a signer connects.
                  !tablesOwnedCount ? "No owned tables." : `${tablesOwnedCount}`
                }
              </p>
            </div>
          </div>
        </div>
        <div>
          <h2>Table data</h2>
          {
            // Render the table data upon pending write txs being finalized.
            // This happens by way of polling for tx confirmation.
            data.length === 0 ? (
              <p>No data is written to the table.</p>
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
                {
                  // Note the usage of `getBaseUrl`. This helper will create the
                  // base URL at the validator, allowing you to leverage
                  // something like a Validator REST API that points to a tx.
                }
                <tbody>
                  {data.map((d) => (
                    <tr key={d.id}>
                      <td>{d.id}</td>
                      <td>{d.name}</td>
                      <td>{d.block}</td>
                      <td>
                        <a
                          href={`${helpers.getBaseUrl(
                            chainId!
                          )}/receipt/${chainId}/${d.tx}`}
                          rel="noreferrer"
                          target="_blank"
                        >
                          {d.tx}
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )
          }
        </div>
      </div>
      {
        // Display a loading overlay upon various method calls, where
        // `isLoading` is used by creates & reads, and `pendingWriteTx` is used
        // when table write queries are made.
      }
      {(pendingWriteTx || isLoading) && <div id="loading"></div>}
    </>
  );
}

export default App;
