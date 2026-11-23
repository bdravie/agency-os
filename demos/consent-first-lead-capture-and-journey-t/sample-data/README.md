# Sample data (all invented)

Every person and organisation here is made up. Addresses use the reserved example.com, example.org and example.net domains. Nothing is a real LinkedIn export: the column headings are a stand-in, so check them against a real download.

| File | What it is |
|---|---|
| `website-forms.json` | 14 website form submissions: 8 newsletter sign-ups, 6 enquiries (two also tick the newsletter). `confirm: true` means they click the confirmation link. |
| `linkedin-lead-export.csv` | 12 rows in the style of a LinkedIn lead form download, with a newsletter tick-box column. |
| `newsletter-clicks.csv` | Total clicks per address, as a newsletter tool would export them (one address in capitals on purpose). |
| `unsubscribe-requests.json` | Two unsubscribe requests: Lena by the link in an issue (loaded with the sample), Sofia by replying (done live in the Loom). |
| `loom/imogen-signup.json` | What to type into the newsletter form in the Loom. |
| `loom/linkedin-new-lead.csv` | Imogen's LinkedIn lead, imported in the Loom. |

**25 contacts:** 24 in the sample plus Imogen in the Loom, from three sources.

**Three deliberate duplicates**, each merged into one contact:
1. Dev Okafor: a newsletter sign-up as `dev.okafor@example.net`, then an enquiry as `  Dev.Okafor@EXAMPLE.net ` (capitals and spaces).
2. Priya Raman: an enquiry as `priya.raman@example.org`, then a LinkedIn lead as `priya.raman+linkedin@example.org` (a +tag).
3. Imogen Thackeray (Loom): a sign-up as `Imogen.Thackeray@Example.com`, then a LinkedIn lead as ` imogen.thackeray@example.com ` (capitals, spaces).

**Clicks and enquiries per contact**, and where each one ends up after the sample (`node scripts/local.mjs sample`):

| Contact | Source | Clicks | Enquiries | Newsletter | Stage |
|---|---|---|---|---|---|
| Amara Okonkwo | Website newsletter | 6 | 0 | confirmed | Opportunity (no draft: newsletter consent only) |
| Tom Haversham | Website newsletter | 3 | 0 | confirmed | Identified |
| Lena Fischer | Website newsletter | 1 | 0 | unsubscribed | Engaged (suppressed) |
| Dev Okafor | Website newsletter + enquiry | 0 | 1 | pending | Opportunity |
| Hannah Wójcik | Website newsletter | 0 | 0 | confirmed | Engaged |
| Marcus Bell | Website newsletter | 0 | 0 | pending | Discovered |
| Rachel Ng | Website newsletter | 2 | 0 | confirmed | Identified |
| Ibrahim Sesay | Website newsletter | 0 | 0 | pending | Discovered |
| Priya Raman | Website enquiry + LinkedIn | 1 | 1 | none | Opportunity |
| Callum Reid | Website enquiry | 4 | 1 | confirmed | Opportunity |
| Sofia Marin | Website enquiry | 0 | 1 | unsubscribed (Loom) | Opportunity (suppressed, skipped) |
| Gareth Pryce | Website enquiry | 0 | 1 | none | Opportunity |
| Eilidh Munro | Website enquiry | 0 | 1 | pending | Opportunity |
| Nkechi Adeyemi | LinkedIn | 0 | 0 | pending | Discovered |
| Oliver Grant | LinkedIn | 0 | 0 | none | Discovered |
| Fatima Rahman | LinkedIn | 3 | 0 | pending | Identified |
| Jamie Whitlock | LinkedIn | 1 | 0 | none | Engaged |
| Aisha Kamara | LinkedIn | 0 | 0 | pending | Discovered |
| Ben Carraway | LinkedIn | 2 | 0 | none | Identified |
| Zara Hollins | LinkedIn | 5 | 0 | pending | Identified |
| Kwame Mensah | LinkedIn | 0 | 0 | none | Discovered |
| Ruth Levene | LinkedIn | 0 | 0 | pending | Discovered |
| Matteo Ricci | LinkedIn | 4 | 0 | none | Identified |
| Siobhan Daly | LinkedIn | 0 | 0 | none | Discovered |
| Imogen Thackeray | Website newsletter + LinkedIn (Loom) | 0 | 0 | confirmed (Loom) | Identified |
