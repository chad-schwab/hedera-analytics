# Hedera Analytics

This project is a tool designed to load Hedera transactions for a one or multiple wallets and generate comprehensive financial information, including USD conversions, simplified multi-hop smart contract transactions, and more. It is written in TypeScript.

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

The program takes two arguments: the account(s) to fetch data for and the tax year to fetch data for. By default, transactions will be loaded two years prior to the year to establish cost basis. You can manually override the data start date with overrideDataStart.

### Example usage

```
npm run transaction-report 0.0.12345 2023
npm run transaction-report 0.0.12345,0.0.12346 2023 --overrideDataStart "2020-01-01"
```

### Output

The files will be output to the `output/<year>/<accounts>/<run-date>` directory

- `all-time/` contains transaction information for all the data that was loaded
- `sold-nfts/` contains a list of NFTs sold during the year of the run
- `sold-tokens/` contains a list of tokens sold during the year of the run
- `all-transactions.csv` contains all the transactions for the tax year
- `vanilla-transactions.csv` contains transactions that are neither token or nft sales. Usually these are airdrops or staking rewards.

## Disclaimer

This tool is intended to provide a simplified view of financial transactions and is not a substitute for professional tax advice. The author of this tool is not a tax professional, and the tool does not guarantee the accuracy of the information it provides. Always consult with a qualified tax professional before making any decisions based on the information provided by this tool.

## Contributing

Contributions are welcome. Please open an issue or submit a pull request.

## LICENSE

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

