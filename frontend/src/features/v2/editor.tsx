"use client";
import { useId, useState } from "react";
import {
  Button,
  DialogShell,
  FormField,
  TextInput,
  MoneyInput,
  DateInput,
  Select,
  Textarea,
} from "../../components/v2/primitives";
import { TransferSummary } from "../../components/v2/forms";
import { validMoney } from "./money";
export type FieldSpec = {
  name: string;
  label: string;
  kind?: "money" | "date" | "select" | "textarea" | "month";
  options?: string[];
  required?: boolean;
  disabled?: boolean;
  hint?: string;
  zero?: boolean;
  signed?: boolean;
};
const optionLabels: Record<string, string> = {
  cash: "Cash",
  bank: "Bank",
  savings: "Savings",
  credit_card: "Credit card",
  mobile_wallet: "Mobile wallet",
  other: "Other",
  income: "Income",
  expense: "Expense",
  both: "Income and expenses",
};
export function Editor({
  title,
  fields,
  initial,
  onSave,
  onClose,
  transfer = false,
  validate,
}: {
  title: string;
  fields: FieldSpec[];
  initial: Record<string, string>;
  onSave: (values: Record<string, string>) => void;
  onClose: () => void;
  transfer?: boolean;
  validate?: (values: Record<string, string>) => Record<string, string>;
}) {
  const prefix = useId();
  const [values, setValues] = useState(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [outcome, setOutcome] = useState("Success");
  const [state, setState] = useState<
    "default" | "pending" | "error" | "uncertain"
  >("default");
  const [review, setReview] = useState(false);
  function submit() {
    const next: Record<string, string> = {};
    for (const field of fields) {
      if (field.disabled) continue;
      const value = values[field.name] ?? "";
      if (field.required && !value.trim())
        next[field.name] = "This field is required.";
      else if (
        field.kind === "money" &&
        !validMoney(value, field.signed, field.zero)
      )
        next[field.name] =
          "Enter a plain amount with up to nine integer digits and two decimals.\nYour draft is preserved; nothing has been saved.";
      else if (field.name === "description" && value.length > 200)
        next[field.name] = "Use 200 characters or fewer.";
      else if (
        (field.kind === "date" || field.kind === "month") &&
        value &&
        !/^\d{4}-\d{2}(-\d{2})?$/.test(value)
      )
        next[field.name] = "Enter a valid calendar date.";
      else if (field.kind === "date" && value && value < "1900-01-01")
        next[field.name] = "Choose a date on or after 1900-01-01.";
    }
    if (values.source && values.source === values.destination)
      next.destination = "Choose a different destination account.";
    if (values.end && values.start && values.end < values.start)
      next.end = "End date must be on or after the start date.";
    Object.assign(next, validate?.(values));
    setErrors(next);
    setState("default");
    if (Object.keys(next).length) {
      setTimeout(
        () =>
          document.getElementById(`${prefix}-${Object.keys(next)[0]}`)?.focus(),
        0,
      );
      return;
    }
    if (transfer && !review) {
      setReview(true);
      return;
    }
    setState("pending");
    if (outcome === "Pending") return;
    setTimeout(() => {
      if (outcome === "Rejection") setState("error");
      else if (outcome === "Uncertain") setState("uncertain");
      else {
        onSave(values);
        onClose();
      }
    }, 600);
  }
  return (
    <DialogShell
      title={review ? "Review transfer" : title}
      description={
        transfer
          ? "Move money between accounts. Transfers do not change income or expenses."
          : "Update your workspace. Changes last until this prototype is reloaded."
      }
      state={state}
      onClose={onClose}
    >
      <form
        className="v2-form"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        {review ? (
          <>
            <TransferSummary
              from={values.source}
              to={values.destination}
              amount={values.amount}
            />
            <p>
              {values.date} · {values.description}
            </p>
            <Button
              variant="text"
              disabled={state === "pending"}
              onClick={() => setReview(false)}
            >
              Back to edit
            </Button>
          </>
        ) : (
          fields.map((field) => {
            const id = `${prefix}-${field.name}`;
            const props = {
              id,
              name: field.name,
              value: values[field.name] ?? "",
              disabled: field.disabled || state === "pending",
              required: field.required,
              "aria-invalid": !!errors[field.name],
              "aria-describedby":
                [
                  errors[field.name] ? `${id}-error` : "",
                  field.hint ? `${id}-hint` : "",
                ]
                  .filter(Boolean)
                  .join(" ") || undefined,
              onChange: (
                event: React.ChangeEvent<
                  HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
                >,
              ) => setValues({ ...values, [field.name]: event.target.value }),
            };
            return (
              <FormField
                key={field.name}
                id={id}
                label={field.label}
                required={field.required}
                hint={field.hint}
                error={errors[field.name]}
              >
                {field.kind === "select" ? (
                  <Select {...props}>
                    {field.options?.map((option) => (
                      <option key={option} value={option}>
                        {optionLabels[option] ?? option}
                      </option>
                    ))}
                  </Select>
                ) : field.kind === "money" ? (
                  <MoneyInput {...props} />
                ) : field.kind === "date" ? (
                  <DateInput {...props} />
                ) : field.kind === "textarea" ? (
                  <Textarea {...props} rows={3} />
                ) : (
                  <TextInput
                    {...props}
                    type={field.kind === "month" ? "month" : "text"}
                  />
                )}
              </FormField>
            );
          })
        )}
        <FormField id={`${prefix}-outcome`} label="Prototype outcome">
          <Select
            id={`${prefix}-outcome`}
            value={outcome}
            disabled={state === "pending"}
            onChange={(event) => {
              setOutcome(event.target.value);
              setState("default");
            }}
          >
            {["Success", "Rejection", "Uncertain", "Pending"].map((item) => (
              <option key={item}>{item}</option>
            ))}
          </Select>
        </FormField>
        <Button
          type="submit"
          loading={state === "pending"}
          disabled={state === "uncertain"}
        >
          {transfer
            ? review
              ? "Confirm transfer"
              : "Review transfer"
            : "Save changes"}
        </Button>
        {state === "pending" && outcome === "Pending" && (
          <Button
            variant="secondary"
            onClick={() => {
              onSave(values);
              onClose();
            }}
          >
            Finish pending preview
          </Button>
        )}
        {state === "uncertain" && (
          <Button variant="secondary" onClick={onClose}>
            Check latest records
          </Button>
        )}
      </form>
    </DialogShell>
  );
}
