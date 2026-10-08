"use client";

import { useId, useState, type ReactNode } from "react";
import { AccountTypeBadge, MoneyDisplay, TransferBadge, formatDecimal } from "./finance";
import type { Account } from "../../lib/api/accounts";
import type { TransferInput } from "../../lib/api/transfers";
import {
  Button,
  Checkbox,
  ConfirmationDialog,
  DateInput,
  Drawer,
  FormField,
  MoneyInput,
  SearchInput,
  SegmentedControl,
  Select,
  Textarea,
  TextInput,
} from "./primitives";

function Field({
  name,
  label,
  kind = "text",
  hint,
  options,
  defaultValue,
  disabled = false,
  required = false,
}: {
  name: string;
  label: string;
  kind?: "text" | "money" | "date" | "select" | "textarea";
  hint?: string;
  options?: string[];
  defaultValue?: string;
  disabled?: boolean;
  required?: boolean;
}) {
  const id = useId();
  const props = {
    id,
    name,
    defaultValue,
    disabled,
    required,
    "aria-describedby": hint ? `${id}-hint` : undefined,
  };
  return (
    <FormField id={id} label={label} hint={hint} required={required}>
      {kind === "select" ? (
        <Select {...props}>
          {options?.map((option) => (
            <option key={option}>{option}</option>
          ))}
        </Select>
      ) : kind === "money" ? (
        <MoneyInput {...props} />
      ) : kind === "date" ? (
        <DateInput {...props} />
      ) : kind === "textarea" ? (
        <Textarea {...props} rows={3} />
      ) : (
        <TextInput {...props} />
      )}
    </FormField>
  );
}
function FixtureForm({
  children,
  label,
  onSubmit,
}: {
  children: ReactNode;
  label: string;
  onSubmit?: () => void;
}) {
  return (
    <form
      className="v2-form"
      aria-label={label}
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit?.();
      }}
    >
      {children}
      <Button type="submit">Preview {label.toLowerCase()}</Button>
      <p className="v2-helper">
        Component specimen · local state only · nothing is saved
      </p>
    </form>
  );
}
const accounts = ["Main Account", "CIB Bank", "Credit card"];
export function AddAccountForm({ onSubmit }: { onSubmit?: () => void }) {
  return (
    <FixtureForm label="Add account" onSubmit={onSubmit}>
      <Field
        name="name"
        label="Account name"
        defaultValue="Main Account"
        required
      />
      <Field
        name="type"
        label="Account type"
        kind="select"
        options={[
          "Cash",
          "Bank",
          "Savings",
          "Credit card",
          "Mobile wallet",
          "Other",
        ]}
      />
      <Field
        name="openingBalance"
        label="Opening balance"
        kind="money"
        defaultValue="0.00"
        hint="Negative opening balances are allowed. Positive credit-card values mean debt."
      />
      <p className="v2-helper">Currency: EGP</p>
    </FixtureForm>
  );
}
export function EditAccountForm({
  locked = true,
  onSubmit,
}: {
  locked?: boolean;
  onSubmit?: () => void;
}) {
  return (
    <FixtureForm label="Edit account" onSubmit={onSubmit}>
      <Field
        name="name"
        label="Account name"
        defaultValue="Main Account"
        required
      />
      <AccountTypeBadge type="cash" />
      <Field
        name="openingBalance"
        label="Opening balance"
        kind="money"
        defaultValue="0.00"
        disabled={locked}
        hint={
          locked
            ? "Locked permanently after first posted activity, even after deletion. Asset/card conversion is also locked."
            : "Editable before first activity."
        }
      />
    </FixtureForm>
  );
}
export function transferAccountLabel(account: Account) {
  const money = formatDecimal(account.currentBalance);
  return `${account.name} — ${account.type === "credit_card" ? money.magnitude + (money.negative ? " EGP credit" : " EGP owed") : (money.negative ? "−" : "") + money.magnitude + " EGP"}${account.status === "archived" ? " (Archived)" : ""}`;
}
type LiveTransferForm = { prefix: string; draft: TransferInput; accounts: Account[]; fields: Record<string, string>; disabled: boolean; onChange: (draft: TransferInput) => void };
export function TransferForm({ onSubmit, live }: { onSubmit?: () => void; live?: LiveTransferForm }) {
  if (live) {
    const { prefix, draft, accounts, fields, disabled, onChange } = live;
    const control = (field: string) => ({ id: `${prefix}-${field}`, disabled, "aria-invalid": !!fields[field], "aria-describedby": fields[field] ? `${prefix}-${field}-error` : undefined });
    const active = accounts.filter(account => account.status === "active");
    return <form className="v2-form" aria-label="Transfer" noValidate onSubmit={event => { event.preventDefault(); onSubmit?.(); }}>
      <TransferBadge />
      <div className="v2-form-columns">
        <FormField id={`${prefix}-sourceAccountId`} label="From account" required error={fields.sourceAccountId}>
          <Select {...control("sourceAccountId")} data-initial-focus value={draft.sourceAccountId} onChange={event => onChange({ ...draft, sourceAccountId: event.target.value, destinationAccountId: draft.destinationAccountId === event.target.value ? "" : draft.destinationAccountId })}>
            <option value="">Choose From account</option>
            {accounts.filter(account => account.status === "archived" && account.id === draft.sourceAccountId).map(account => <option key={account.id} value={account.id} disabled>{transferAccountLabel(account)}</option>)}
            {active.map(account => <option key={account.id} value={account.id}>{transferAccountLabel(account)}</option>)}
          </Select>
        </FormField>
        <FormField id={`${prefix}-destinationAccountId`} label="To account" required error={fields.destinationAccountId}>
          <Select {...control("destinationAccountId")} value={draft.destinationAccountId} onChange={event => onChange({ ...draft, destinationAccountId: event.target.value })}>
            <option value="">Choose To account</option>
            {accounts.filter(account => account.status === "archived" && account.id === draft.destinationAccountId).map(account => <option key={account.id} value={account.id} disabled>{transferAccountLabel(account)}</option>)}
            {active.filter(account => account.id !== draft.sourceAccountId).map(account => <option key={account.id} value={account.id}>{transferAccountLabel(account)}</option>)}
          </Select>
        </FormField>
      </div>
      <FormField id={`${prefix}-amount`} label="Amount" required error={fields.amount} hint="EGP. Transfers move money between accounts; they are not income or expense.">
        <MoneyInput {...control("amount")} aria-describedby={[`${prefix}-amount-hint`, fields.amount ? `${prefix}-amount-error` : ""].filter(Boolean).join(" ")} value={draft.amount} onChange={event => onChange({ ...draft, amount: event.target.value })}/>
      </FormField>
      <FormField id={`${prefix}-date`} label="Date" required error={fields.date} hint="Calendar date in Cairo.">
        <DateInput {...control("date")} aria-describedby={[`${prefix}-date-hint`, fields.date ? `${prefix}-date-error` : ""].filter(Boolean).join(" ")} min="1900-01-01" value={draft.date} onChange={event => onChange({ ...draft, date: event.target.value })}/>
      </FormField>
      <FormField id={`${prefix}-description`} label="Description (optional)" error={fields.description} hint="Up to 200 characters.">
        <Textarea {...control("description")} aria-describedby={[`${prefix}-description-hint`, fields.description ? `${prefix}-description-error` : ""].filter(Boolean).join(" ")} rows={3} value={draft.description ?? ""} onChange={event => onChange({ ...draft, description: event.target.value })}/>
      </FormField>
      <Button type="submit" disabled={disabled}>Review transfer</Button>
    </form>;
  }
  return (
    <FixtureForm label="Transfer" onSubmit={onSubmit}>
      <TransferBadge />
      <div className="v2-form-columns">
        <Field
          name="source"
          label="From account"
          kind="select"
          options={accounts}
        />
        <Field
          name="destination"
          label="To account"
          kind="select"
          options={["Credit card", "CIB Bank", "Main Account"]}
        />
      </div>
      <Field
        name="amount"
        label="Amount"
        kind="money"
        defaultValue="2000.00"
        required
        hint="Choose different active owned accounts; no income or expense is created."
      />
      <Field name="date" label="Date" kind="date" defaultValue="2026-10-06" />
      <Field
        name="description"
        label="Description (optional)"
        kind="textarea"
        defaultValue="Card payment"
      />
    </FixtureForm>
  );
}
export function TransferSummary({
  from,
  to,
  amount,
  date,
  description,
}: {
  from: string;
  to: string;
  amount: string;
  date?: string;
  description?: string | null;
}) {
  return (
    <div className="v2-transfer-summary">
      <TransferBadge />
      <dl>
        <div>
          <dt>From</dt>
          <dd>{from}</dd>
        </div>
        <div>
          <dt>To</dt>
          <dd>{to}</dd>
        </div>
      </dl>
      <MoneyDisplay value={amount} kind="transfer" />
      {date && <p><time dateTime={date}>{date}</time></p>}
      {description && <p>{description}</p>}
      <p className="v2-helper">
        Card payments reduce debt; they do not add an expense.
      </p>
    </div>
  );
}
export function RecurringForm({ onSubmit }: { onSubmit?: () => void }) {
  const [type, setType] = useState("Expense");
  return (
    <FixtureForm label="Recurring schedule" onSubmit={onSubmit}>
      <SegmentedControl
        label="Type"
        options={["Income", "Expense"]}
        value={type}
        onChange={setType}
      />
      <Field
        name="description"
        label="Description"
        defaultValue="Monthly rent"
        required
      />
      <Field name="account" label="Account" kind="select" options={accounts} />
      <Field
        name="category"
        label="Category"
        kind="select"
        options={
          type === "Expense"
            ? ["Bills", "Food", "Other"]
            : ["Salary", "Freelance", "Other"]
        }
      />
      <Field name="amount" label="Amount" kind="money" defaultValue="5000.00" />
      <Field
        name="frequency"
        label="Frequency"
        kind="select"
        options={["Daily", "Weekly", "Monthly", "Yearly"]}
      />
      <div className="v2-form-columns">
        <Field
          name="start"
          label="Start date"
          kind="date"
          defaultValue="2026-10-31"
        />
        <Field name="end" label="End date (optional)" kind="date" />
      </div>
      <p className="v2-helper">
        Past starts do not import history. Month-end dates clamp without drift.
        Feb 29 uses Feb 28 in non-leap years. Posting runs daily.
      </p>
    </FixtureForm>
  );
}
export function BudgetForm({ onSubmit }: { onSubmit?: () => void }) {
  return (
    <FixtureForm label="Budget" onSubmit={onSubmit}>
      <Field
        name="category"
        label="Expense category"
        kind="select"
        options={["Food", "Transport", "Other"]}
      />
      <Field
        name="amount"
        label="Allocated amount"
        kind="money"
        defaultValue="3000.00"
      />
      <div className="v2-form-columns">
        <Field
          name="month"
          label="Month"
          kind="select"
          options={["October 2026", "November 2026"]}
        />
        <Field
          name="threshold"
          label="Warning threshold (%)"
          defaultValue="90"
          hint="Integer 1–100; default 90."
        />
      </div>
    </FixtureForm>
  );
}
export function GoalForm({ onSubmit }: { onSubmit?: () => void }) {
  return (
    <FixtureForm label="Goal" onSubmit={onSubmit}>
      <Field name="name" label="Goal name" defaultValue="Emergency reserve" />
      <Field
        name="target"
        label="Target amount"
        kind="money"
        defaultValue="60000.00"
      />
      <Field
        name="saved"
        label="Saved amount (manual)"
        kind="money"
        defaultValue="32000.00"
      />
      <Field name="date" label="Target date (optional)" kind="date" />
      <Field
        name="linkedAccount"
        label="Linked account (optional)"
        kind="select"
        options={["None", ...accounts]}
        hint="Reference only; does not calculate savings."
      />
    </FixtureForm>
  );
}
export function CategoryForm({ onSubmit }: { onSubmit?: () => void }) {
  return (
    <FixtureForm label="Category" onSubmit={onSubmit}>
      <Field name="name" label="Category name" defaultValue="Education" />
      <Field
        name="kind"
        label="Applies to"
        kind="select"
        options={["Expense", "Income", "Both"]}
      />
      <p className="v2-helper">
        Kind locks once referenced; archive pauses linked schedules.
      </p>
    </FixtureForm>
  );
}
export function ProfileForm({ onSubmit }: { onSubmit?: () => void }) {
  return (
    <FixtureForm label="Profile" onSubmit={onSubmit}>
      <Field
        name="displayName"
        label="Display name"
        defaultValue="Design workspace"
      />
      <Field
        name="email"
        label="Email"
        defaultValue="fixture@example.test"
        disabled
      />
      <div className="v2-form-columns">
        <Field name="currency" label="Currency" defaultValue="EGP" disabled />
        <Field
          name="timezone"
          label="Timezone"
          defaultValue="Africa/Cairo"
          disabled
        />
      </div>
      <Field name="locale" label="Locale" defaultValue="en" disabled />
    </FixtureForm>
  );
}
export function CategoryRow({
  name,
  system = false,
  archived = false,
  onEdit,
}: {
  name: string;
  system?: boolean;
  archived?: boolean;
  onEdit?: () => void;
}) {
  return (
    <div className="v2-data-row">
      <div>
        <strong>{name}</strong>
        <span className="v2-helper">
          {system ? "System · read-only" : "Custom · editable"}
          {archived ? " · Archived history" : ""}
        </span>
      </div>
      {system ? (
        <span className="v2-badge">System</span>
      ) : (
        <Button variant="text" onClick={onEdit}>
          {archived ? "Restore" : "Edit"}
        </Button>
      )}
    </div>
  );
}
export function SettingsSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="v2-settings-section">
      <h3>{title}</h3>
      {children}
    </section>
  );
}
export function SettingsNav({
  active,
  onChange,
}: {
  active: string;
  onChange: (value: string) => void;
}) {
  return (
    <nav className="v2-settings-nav" aria-label="Settings sections">
      {["Profile", "Categories", "Security"].map((label) => (
        <Button
          key={label}
          variant={active === label ? "secondary" : "text"}
          aria-current={active === label ? "location" : undefined}
          onClick={() => onChange(label)}
        >
          {label}
        </Button>
      ))}
    </nav>
  );
}
export function CompleteGoalConfirmation({
  onClose,
  onConfirm,
}: {
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <ConfirmationDialog
      title="Mark goal complete?"
      description="Saved amount has reached the target. This explicitly changes status; it does not move money."
      confirmLabel="Mark complete"
      onClose={onClose}
      onConfirm={onConfirm}
    />
  );
}
export function ArchiveAccountConfirmation({
  onClose,
  onConfirm,
}: {
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <ConfirmationDialog
      title="Archive Main Account?"
      description="2 active recurring schedules will pause. Historical balances remain included. Restoring this account will not resume schedules automatically."
      confirmLabel="Archive account"
      onClose={onClose}
      onConfirm={onConfirm}
    />
  );
}

export function SearchBar({
  value,
  onChange,
  onSearch,
  pending = false,
}: {
  value: string;
  onChange: (value: string) => void;
  onSearch: () => void;
  pending?: boolean;
}) {
  const id = useId();
  return (
    <form
      className="v2-search-bar"
      role="search"
      onSubmit={(event) => {
        event.preventDefault();
        onSearch();
      }}
    >
      <FormField id={id} label="Search transactions">
        <SearchInput
          id={id}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder="Description, account or category"
        />
      </FormField>
      <Button type="submit" variant="secondary" loading={pending}>
        Search
      </Button>
    </form>
  );
}
export function FilterSelect({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: string[];
  value: string;
  onChange: (value: string) => void;
}) {
  const id = useId();
  return (
    <FormField label={label} id={id}>
      <Select
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        {options.map((option) => (
          <option key={option}>{option}</option>
        ))}
      </Select>
    </FormField>
  );
}
export function DateRangeField() {
  return (
    <div className="v2-form-columns">
      <Field
        name="from"
        label="From date"
        kind="date"
        defaultValue="2026-10-01"
      />
      <Field name="to" label="To date" kind="date" defaultValue="2026-10-06" />
    </div>
  );
}
export function FilterChip({
  label,
  onRemove,
}: {
  label: string;
  onRemove: () => void;
}) {
  return (
    <Button
      variant="secondary"
      className="v2-filter-chip"
      onClick={onRemove}
      aria-label={`Remove ${label} filter`}
    >
      {label}
      <span aria-hidden="true">×</span>
    </Button>
  );
}
export function ClearFilters({ onClick }: { onClick: () => void }) {
  return (
    <Button variant="text" onClick={onClick}>
      Clear filters
    </Button>
  );
}
export function MobileFilterSheet({
  children,
  onClose,
}: {
  children: ReactNode;
  onClose: () => void;
}) {
  return (
    <Drawer
      title="Transaction filters"
      description="Quiet filters for the ledger specimen."
      onClose={onClose}
    >
      <div className="v2-form" style={{ marginTop: 24 }}>
        {children}
        <Button onClick={onClose}>Apply filters</Button>
      </div>
    </Drawer>
  );
}
export function PreferenceSpecimen() {
  return <Checkbox label="Include archived history" defaultChecked />;
}
