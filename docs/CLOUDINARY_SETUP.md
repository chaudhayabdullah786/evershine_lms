# Cloudinary Setup for Production Uploads

This LMS currently uses Cloudinary-backed uploads for profile images, document uploads, and payment proof flows. Keep these variables configured in every environment where upload-dependent features must work.

## Required variables

Set these in the hosting environment, not in Git:

```env
CLOUDINARY_CLOUD_NAME="your-cloud-name"
CLOUDINARY_API_KEY="your-api-key"
CLOUDINARY_API_SECRET="your-api-secret"
CLOUDINARY_UPLOAD_FOLDER="evershaheen"
REQUIRE_CLOUDINARY="true"
```

Use `CLOUDINARY_UPLOAD_FOLDER="evershaheen"` as the base folder. The signed upload endpoint appends safe subfolders such as `students`, `teachers`, `documents`, `challans`, and `results`.

## Where to get the values

1. Open the Cloudinary Console.
2. Open the product environment for this LMS.
3. Go to the API Keys or product environment credentials page.
4. Copy the cloud name into `CLOUDINARY_CLOUD_NAME`.
5. Copy the API key into `CLOUDINARY_API_KEY`.
6. Copy the API secret into `CLOUDINARY_API_SECRET`.
7. Do not paste the API secret into chat, screenshots, Git commits, issue comments, or PR descriptions.

The Cloudinary Node.js SDK expects `cloud_name`, `api_key`, and `api_secret`. This repository maps those values from the environment variables above in `lib/cloudinary.ts`.

## Hostinger setup

In Hostinger hPanel:

1. Open Websites.
2. Select the LMS site.
3. Open the Node.js app settings.
4. Add each variable under Environment Variables.
5. Save changes.
6. Restart or redeploy the Node.js app.

Run this before marking deployment ready:

```bash
REQUIRE_CLOUDINARY=true npm run check:env
```

Expected result:

```text
Production environment check passed.
```

## GitHub Actions / CI setup

Only add Cloudinary secrets to GitHub if a workflow needs to exercise real upload behavior. Build, lint, and unit tests should not require real Cloudinary credentials.

If needed, configure repository secrets:

- `CLOUDINARY_CLOUD_NAME`
- `CLOUDINARY_API_KEY`
- `CLOUDINARY_API_SECRET`

Then pass them as job environment variables only to the upload smoke-test job.

## Rotation procedure

Rotate credentials if they are exposed in terminal logs, screenshots, Git history, PR comments, chat, or a shared document.

1. Create or reveal a new API secret in Cloudinary.
2. Update Hostinger environment variables.
3. Update GitHub repository secrets if used by CI.
4. Redeploy/restart the app.
5. Run `REQUIRE_CLOUDINARY=true npm run check:env`.
6. Test a student passport-size image upload and payment proof upload.
7. Revoke the exposed old secret.

## Release note

The Hostinger long-term plan may replace Cloudinary with local disk storage. Until that migration is implemented and verified, Cloudinary is a production dependency for upload-backed LMS functionality.
