-- AlterTable
ALTER TABLE "ArchiveRecord" ADD COLUMN     "subjectHeadings" TEXT[] DEFAULT ARRAY[]::TEXT[];
