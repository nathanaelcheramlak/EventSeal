import { relations } from "drizzle-orm";
import {
  bigserial,
  index,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid
} from "drizzle-orm/pg-core";

export const qrStatus = pgEnum("qr_status", ["ACTIVE", "USED", "REVOKED", "EXPIRED"]);

export const auditAction = pgEnum("audit_action", [
  "LOGIN_SUCCESS",
  "LOGIN_FAILED",
  "QR_GENERATED",
  "QR_VERIFY_SUCCESS",
  "QR_VERIFY_FAILED"
]);

export const auditResult = pgEnum("audit_result", ["SUCCESS", "FAILURE"]);

export const organizers = pgTable("organizers", {
  id: uuid("id").primaryKey().defaultRandom(),
  username: text("username").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
});

export const qrCodes = pgTable(
  "qr_codes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => organizers.id),
    name: text("name").notNull(),
    phone: text("phone"),
    status: qrStatus("status").notNull().default("ACTIVE"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull()
  },
  (table) => ({
    statusIdx: index("idx_qr_codes_status").on(table.status),
    expiresAtIdx: index("idx_qr_codes_expires_at").on(table.expiresAt)
  })
);

export const auditLogs = pgTable(
  "audit_logs",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    organizerId: uuid("organizer_id").references(() => organizers.id),
    qrCodeId: uuid("qr_code_id").references(() => qrCodes.id),
    action: auditAction("action").notNull(),
    result: auditResult("result").notNull(),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    createdAtIdx: index("idx_audit_logs_created_at").on(table.createdAt),
    qrCodeIdIdx: index("idx_audit_logs_qr_code_id").on(table.qrCodeId),
    organizerIdIdx: index("idx_audit_logs_organizer_id").on(table.organizerId)
  })
);

export const organizerRelations = relations(organizers, ({ many }) => ({
  qrCodes: many(qrCodes),
  auditLogs: many(auditLogs)
}));

export const qrCodeRelations = relations(qrCodes, ({ one, many }) => ({
  creator: one(organizers, {
    fields: [qrCodes.createdBy],
    references: [organizers.id]
  }),
  auditLogs: many(auditLogs)
}));

export const auditLogRelations = relations(auditLogs, ({ one }) => ({
  organizer: one(organizers, {
    fields: [auditLogs.organizerId],
    references: [organizers.id]
  }),
  qrCode: one(qrCodes, {
    fields: [auditLogs.qrCodeId],
    references: [qrCodes.id]
  })
}));

export type Organizer = typeof organizers.$inferSelect;
export type NewOrganizer = typeof organizers.$inferInsert;
export type QrCode = typeof qrCodes.$inferSelect;
export type NewQrCode = typeof qrCodes.$inferInsert;
export type AuditLog = typeof auditLogs.$inferSelect;
export type NewAuditLog = typeof auditLogs.$inferInsert;

