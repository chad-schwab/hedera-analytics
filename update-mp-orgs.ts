import fs from "node:fs";
import path from "node:path";

import fetch from "node-fetch";
import invariant from "tiny-invariant";

type Orgs = {
  UsageTier: {
    Name: string;
  };
  Company: string;
  Contact: {
    Email: string;
    Name: string;
  };
  OrganizationId: string;
};

function mapData(orgData: Orgs[]) {
  return orgData.map((row) => {
    const company = row.Company ?? "Unknown company";
    return `"${row.OrganizationId}","${row.UsageTier.Name}","${company}","${row.Contact.Email}"`;
  });
}

async function listLookupTables({ username, password, projectId }) {
  const creds = Buffer.from(`${username}:${password}`).toString("base64");

  const resp = await fetch(
    `https://api.mixpanel.com/lookup-tables?project_id=${projectId}`,
    {
      method: "GET",
      headers: {
        Authorization: `Basic ${creds}`,
        Accept: "application/json",
      },
    }
  );

  console.log(await resp.json());
}

async function main() {
  invariant(process.env.MP_ACCOUNT);
  invariant(process.env.MP_PASSWORD);
  invariant(process.env.MP_PROJECT);

  const username = process.env.MP_ACCOUNT;
  const password = process.env.MP_PASSWORD;

  // listLookupTables({ username, password, projectId: process.env.MP_PROJECT });

  const creds = Buffer.from(`${username}:${password}`).toString("base64");
  const orgData = JSON.parse(
    fs.readFileSync(path.resolve(__dirname, "orgs.json"), "utf8")
  ) as { items: Orgs[] };

  // see https://developer.mixpanel.com/reference/replace-lookup-table
  const resp = await fetch(
    `https://api.mixpanel.com/lookup-tables/fac96a55-6797-40c7-b17e-3c1fcdeea1be?project_id=${process.env.MP_PROJECT}`,
    {
      method: "PUT",
      headers: {
        Authorization: `Basic ${creds}`,
        Accept: "application/json",
        "Content-Type": "text/csv",
      },
      body: [
        "OrganizationId,Tier,Company,Contact",
        ...mapData(orgData.items),
      ].join("\n"),
    }
  );

  if (!resp.ok) {
    const body = await resp.json();
    const cause = {
      status: resp.status,
      url: resp.url,
      error: body.error,
      failed_records: JSON.stringify(body.failed_records),
    };
    throw new Error("Failed calling Mixpanel", { cause });
  }
  return resp;
}

const start = Date.now();
main()
  .then(() => {
    console.log(`Complete! Took ${Date.now() - start}ms`);
  })
  .catch(console.error);
