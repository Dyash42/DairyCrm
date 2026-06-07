# Customer CSV Import — SOP

Use this to onboard your existing book of 400–500 customers in one shot
before launching WhatsApp onboarding. After launch, new customers come in
via WhatsApp; this is a one-time migration tool but can be re-used any
time you acquire a list of customers in bulk.

---

## Quick start (5 minutes)

1. Go to **Customers → Import CSV** in the admin panel
2. Click **Template (CSV)** to download `jharanai-customers-template.csv`
3. Open it in Excel / Google Sheets, fill in your customer rows
4. Drag the saved file back onto the upload area
5. Review the preview — every row is validated before commit
6. Click **Import N customers** — done

---

## Required vs optional columns

| Column | Required? | Notes |
|---|---|---|
| `name` | **Yes** | Customer's full name |
| `phone` | **Yes** | 10-digit Indian mobile. We auto-prefix `+91` if missing. Must be unique. |
| `alt_phone` | No | Backup contact |
| `email` | No | For digital receipts (PRD §2) |
| `address_line1` | **Yes** | What the milkman reads on his route |
| `area` | No | Free text — used by Customer search |
| `pin_code` | No | 6-digit PIN |
| `route_name` | **Yes** | Must match an existing Route. Create routes first. |
| `product_code` | No | Defaults to `COW_MILK`. Must exist on the Products page. |
| `litres_per_day` | **Yes** | Numeric; supports decimals like `1.5` |
| `days_of_week` | No | See below; defaults to `EVERY_DAY` |
| `duration_days` | No | Defaults to the **Settings → Subscription rules** value (initially 30) |
| `start_date` | No | Defaults to tomorrow. Accepts `YYYY-MM-DD`, `DD/MM/YYYY`, `DD MMM YYYY` |
| `customer_code` | No | Optional override (e.g. preserve legacy codes). System auto-generates `JHR-XXXXXX` if blank. |

---

## `days_of_week` shorthand

Use any of these in the cell:

| Shorthand | Meaning |
|---|---|
| `EVERY_DAY` (default) | Sun – Sat |
| `ALL_DAYS` | Same as `EVERY_DAY` |
| `MON_TO_SAT` | Skips Sunday |
| `WEEKDAYS` | Mon – Fri |
| `WEEKENDS` | Sat + Sun |
| `1,2,3,4,5,6` | Numeric list. **0 = Sun, 1 = Mon, … 6 = Sat** |

---

## Examples

```csv
name,phone,address_line1,route_name,product_code,litres_per_day,days_of_week,duration_days,start_date,customer_code
Sunil Pradhan,9111111111,"MIG-12, Gandhi Nagar, 3rd Lane",Route 4,COW_MILK,2,EVERY_DAY,30,,
Subhransu Behera,9111111112,"Plot 47, Gajapati Nagar",Route 3,COW_MILK,1,MON_TO_SAT,30,,
Anita Sahoo,9111111113,"Plot 4, Sasibhushan Lane",Route 4,BUFFALO_MILK,1.5,"1,2,3,4,5,6",30,15/06/2026,JHR-100390
```

Notes on the third row:
- Address has a comma → wrap the whole cell in `"..."`
- `days_of_week` numeric list also needs quoting because it contains commas
- `start_date` is parsed from `15/06/2026` (DD/MM/YYYY)
- `customer_code` is preserved (does not auto-generate)

---

## What the importer validates before committing

For every row, the importer checks:

- All required columns are present and non-empty
- `phone` is a valid 10/12-digit Indian number, **unique** across the file
- `phone` is **not already registered** in the database
- `litres_per_day` is between 0 and 50
- `route_name` exists on the Routes page
- `product_code` exists on the Products page
- `days_of_week` matches one of the shorthands or a valid 0–6 list
- `duration_days` is between 1 and 365
- `start_date` parses cleanly
- `customer_code` (if given) is unique across the file and the database

Any row that fails is **skipped** at commit time and shown in the **Issues**
table on the preview page. Fix in Excel and re-upload.

---

## What happens at commit

For each valid row, in a single transaction per row:

1. Allocate a customer code (`JHR-XXXXXX`) or use the supplied one
2. Generate the customer's QR (deterministic from the code)
3. Create the `Customer` row with the route assignment
4. Create the initial `QrCode` audit row (status `ACTIVE`, version 1)
5. Create an `ACTIVE` `Subscription` row linked to the chosen product,
   with the cached `ratePerLitre` from the product at this moment
6. Schedule the renewal reminder for `subscription.renewal_reminder_days_before` days before end date

The Subscription's `ratePerLitre` is **frozen at import time**. If the
admin later changes a product's rate, existing subscriptions keep their
old rate until renewed. This is intentional — historical quotes must replay.

---

## Common pitfalls

| Symptom | Cause | Fix |
|---|---|---|
| "Route X doesn't exist" | Route name doesn't match exactly (case-sensitive) | Use the exact name from the Routes page |
| "Phone … already exists" | Customer was previously imported or onboarded | Remove the row, or delete the old customer first |
| "Could not parse start_date" | Unusual date format | Use `YYYY-MM-DD` or `DD/MM/YYYY` |
| Excel mangled the phone column | Excel dropped leading zeros / used scientific notation | Format the phone column as **Text** in Excel before saving |
| Wrong characters in name | CSV saved as ANSI not UTF-8 | Save As → CSV UTF-8 in Excel |

---

## Limits

- **2,000 rows per upload**. For larger files, split into batches.
- The validate + commit endpoints are admin-only and JWT-protected.

---

## API (for advanced users)

| Endpoint | Method | Purpose |
|---|---|---|
| `/customers/bulk/template` | GET | Download the CSV template |
| `/customers/bulk/validate` | POST `{ csv }` | Validate; returns preview + issues |
| `/customers/bulk/commit` | POST `{ rows }` | Create customers; returns counts |

All three require admin JWT.
