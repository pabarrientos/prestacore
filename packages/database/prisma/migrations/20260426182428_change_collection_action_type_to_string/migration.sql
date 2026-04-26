-- AlterTable
ALTER TABLE "CollectionAction" ALTER COLUMN type TYPE text USING type::text;
