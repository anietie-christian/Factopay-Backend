# ----------------------------------------------------------------------------------------------------------------#*eddiere
/*
  Warnings:

  - The values [GHANA_CARD] on the enum `KycDocumentType` will be removed. If these variants are still used in the database, this will fail.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "KycDocumentType_new" AS ENUM ('GOVERNMENT_ID', 'PASSPORT', 'SELFIE', 'PROOF_OF_ADDRESS', 'SOURCE_OF_FUNDS');
ALTER TABLE "kyc_documents" ALTER COLUMN "document_type" TYPE "KycDocumentType_new" USING ("document_type"::text::"KycDocumentType_new");
ALTER TYPE "KycDocumentType" RENAME TO "KycDocumentType_old";
ALTER TYPE "KycDocumentType_new" RENAME TO "KycDocumentType";
DROP TYPE "public"."KycDocumentType_old";
COMMIT;
