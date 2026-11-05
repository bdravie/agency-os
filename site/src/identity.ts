// Who is behind the site, as the law asks for it. Not yet a company: the owner's full name and a physical address (a sole trader using a trading name).
// Once there is a company number in site.json, this switches to the company wording by itself; the address should then be the registered office.
export type Identity = { businessName: string; ownerFullName: string; businessAddress: string; companyNumber?: string };

export const identityLine = (s: Identity): string =>
  s.companyNumber?.trim()
    ? `${s.businessName}, company number ${s.companyNumber.trim()}, ${s.businessAddress}`
    : `${s.businessName} is the trading name of ${s.ownerFullName}, ${s.businessAddress}`;
