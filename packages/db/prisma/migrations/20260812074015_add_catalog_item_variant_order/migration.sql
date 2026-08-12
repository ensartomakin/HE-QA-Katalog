-- AlterTable
ALTER TABLE "CatalogItem" ADD COLUMN     "variantOrder" TEXT[] DEFAULT ARRAY[]::TEXT[];
