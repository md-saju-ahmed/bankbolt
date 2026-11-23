import { z } from "zod";
import { accountType, verificationStatus } from "../../db/schema.ts";
import { dhakaDate } from "../../lib/dhaka-date.ts";

export const customerEmail = z
  .string()
  .trim()
  .toLowerCase()
  .max(254)
  .pipe(z.email());
export const customerFullName = z.string().trim().min(1).max(120);
export const customerPhone = z
  .string()
  .trim()
  .regex(/^\+?[0-9][0-9 ().-]{5,23}$/);
export const customerAddress = z.string().trim().min(1).max(300);
export const customerOccupation = z.string().trim().min(1).max(100);

export const externalPhotoUrl = z
  .string()
  .trim()
  .max(2048)
  .pipe(
    z.url({
      protocol: /^https$/,
      hostname: z.regexes.domain,
      normalize: true,
    }),
  )
  .refine((value) => {
    const url = URL.parse(value);
    return (
      url !== null &&
      value.length <= 2048 &&
      !url.username &&
      !url.password &&
      !/\.(?:localhost|local|internal)$/i.test(url.hostname)
    );
  }, "Use a public HTTPS image URL without credentials.");

export const registration = z.strictObject({
  fullName: customerFullName,
  email: customerEmail,
  phone: customerPhone,
  dateOfBirth: z.iso
    .date()
    .refine((date) => date >= "0001-01-01" && date <= dhakaDate(new Date())),
  address: customerAddress,
  identityReference: z.string().trim().toUpperCase().min(1).max(80),
  occupation: customerOccupation.optional(),
  photoUrl: externalPhotoUrl.optional(),
  password: z.string().min(12).max(128),
});

export const lookup = z.strictObject({ email: customerEmail });
export const review = z.strictObject({
  status: z.enum(verificationStatus.enumValues),
});
export const customerParams = z.strictObject({ customerId: z.uuid() });
export const accountParams = customerParams.extend({ accountId: z.uuid() });
export const pages = z.strictObject({
  page: z.coerce.number().int().min(1).max(1_000_000).default(1),
});

export const accountRequest = z
  .strictObject({
    requestId: z.uuid(),
    type: z.enum(accountType.enumValues),
    businessName: z.string().trim().min(1).max(120).optional(),
    businessRegistrationReference: z.string().trim().min(1).max(80).optional(),
  })
  .refine(
    (data) =>
      data.type === "BUSINESS" ||
      (!data.businessName && !data.businessRegistrationReference),
    { message: "Business details require a Business account." },
  );
