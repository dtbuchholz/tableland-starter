# Getting started with Tableland

A basic React app with a browser wallet (or local private key) connection to Tableland while using the SDK.

## Background

### Overview

This tutorial walks through the basics of using the [Tableland SDK](https://github.com/tablelandnetwork/js-tableland). It creates a very basic [React](https://reactjs.org/) app where a user will first connect their wallet. Then, they'll be able to create a table (minted to their address), write to the table, and read data from the table. The table's name and table data get rendered in the UI, and there are some special SQL features demonstrated as well. Lastly, the [`local-tableland`](https://github.com/tablelandnetwork/local-tableland) is leveraged to make it easy to develop locally with both a Tableland and [Hardhat](https://hardhat.org/) node.

One of the key pieces to understand is the `Database` API. Every query in Tableland runs through the same API, where you can pass create statements, writes, and reads to `Database.prepare(...)` and then execute them. An execution should come with a account singer for on-chain transactions (create, writes) but need not be passed to `Database` for reads. Each query execution comes with a `metadata`, `results`, and `success` in its response. Only read queries make use of `results`, but all queries will have `metadata` and `success` returned.

### Project structure

The table schema is hardcoded as the following: `id integer primary key, name text, block text, tx text`. What's important to understand is that

- `id integer primary key` will auto-increment upon inserting values into the table but not defining the `id` column. In other words, if you `INSERT INTO my_table_name (name) VALUES ("Bobby Tables")`, the `id` column will increment will each new row inserted.
- The `block` column will have the chain's block number inserted by using the "magic" function `BLOCK_NUM()` within an insert statement (e.g., `INSERT INTO my_table_name (block) VALUES (BLOCK_NUM())`).
- Similarly, this is used for the `tx` (transaction hash) column with the function `TXN_HASH()`.
  Once a table is created and written to, the table data can be displayed in the UI by clicking the "Read" button. There are more sophisticated ways to do this in a production setting, like polling for table changes, but the core read functionality is demonstrated appropriately

For local development, the `local-tableland` package is installed, making it easy to run these changes while connecting to a local hardhat node. Thus, you can test things out locally on both a chain and the Tableland network.

This app is pretty straightforward and uses the boilerplate code from `npx create-react-app`, and it uses the TypeScript template. For those looking to use a private key connection instead of a browser wallet, there is some commented out code in the `connect()` method that allows you to read a private key from `.env` to create a `Wallet`. All in all, the following methods are implemented:

- `connect()`: Make an account connection to later use a signer for Tableland `Database` API interactions.
- `create()`: Create a table with the connected signer, using a form input value for the table's `prefix`.
- `write()`: Write to the table with form input value; this only mutates a single `name` column, and the others (`id`, `block`, and `tx`) are automatically updated by the database using auto-increment functionality or magic functions.
- `read()`: Use a read-only `Database` connection (i.e., you don't need a signer to read) to retrieve table data.

All application code is placed in `App.tsx` to keep things simple, and some basic styles are included in `App.css`. ANd for more implementation details, comments are also provided throughout the code.

## Usage

First, install all dependencies with `npm install`. Then, in the project directory, you should:

1. Start a local Tableland node (available at [http://localhost:8080](http://localhost:8080)): `npx local-tableland`
2. In a separate window, start the React app (opens in [http://localhost:3000](http://localhost:3000)): `npm start`

If you're interested in directly querying the local Tableland node, you can also make API requests directly in your browser to [http://localhost:8080](http://localhost:8080), such as the auto-generated healthbot table or the table you create in the app itself. Just pass a read query to the `/query` endpoint, such as `SELECT * FROM healthbot_31337_1`:

```
http://localhost:8080/query?s=select%20*%20from%20healthbot_31337_1
```
