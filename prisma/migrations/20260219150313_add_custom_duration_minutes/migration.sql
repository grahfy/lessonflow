-- AlterTable
ALTER TABLE "Booking" ADD COLUMN "customDurationMinutes" INTEGER;

-- AlterTable
ALTER TABLE "BookingRequest" ADD COLUMN "customDurationMinutes" INTEGER;

-- AlterTable
ALTER TABLE "BookingSeries" ADD COLUMN "customDurationMinutes" INTEGER;
