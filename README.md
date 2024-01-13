# Hedera Analytics

This project is a tool designed to load Hedera transactions for a wallet and generate comprehensive financial information, including USD conversions, simplified multi-hop smart contract transactions, and more. It is written in TypeScript.

## Features

- Load transactions for a specific Hedera account.
- Load transactions for multiple Hedera accounts and present a unified view.
- Convert transaction values to USD.
- Derive NFT sale price in USD at time of transaction
- Lookup Fungible Token Exchange Rates at time of transaction
- Simplify multi-hop transfers from smart contract transactions.
- Fetch sales for a specific tax year.
- Cache data to the filesystem for fast refreshes.

## Usage

The program takes two arguments: the account(s) to fetch data for and the tax year to fetch data for.

Example usage:

```
npm run tax-report 0.0.12345 2023
npm run tax-report 0.0.12345,0.0.12346 2023
```

## Disclaimer

This tool is intended to provide a simplified view of financial transactions and is not a substitute for professional tax advice. The author of this tool is not a tax professional, and the tool does not guarantee the accuracy of the information it provides. Always consult with a qualified tax professional before making any decisions based on the information provided by this tool.

## Contributing

Contributions are welcome. Please open an issue or submit a pull request.

