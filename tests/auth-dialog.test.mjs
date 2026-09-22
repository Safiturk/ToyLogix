import test from "node:test";
import assert from "node:assert/strict";
import {
  isRomanianPhone,
  isEmailAddress,
  hasPasswordComplexity,
  registrationErrorMessage,
} from "../lib/auth-validation.ts";
import { openDialog } from "../lib/dialog.ts";

test("existing phone, email and password rules remain separate from length validation", () => {
  assert.equal(isRomanianPhone("0754654876"), true);
  for (const phone of ["+40754654876", "754654876", "07546548760"])
    assert.equal(isRomanianPhone(phone), false);
  assert.equal(isEmailAddress("user@example.ro"), true);
  assert.equal(isEmailAddress("user@example"), false);
  assert.equal(hasPasswordComplexity("Ș1!"), true);
  for (const password of ["abc1!", "ABC!", "ABC1"])
    assert.equal(hasPasswordComplexity(password), false);
});

test("registration errors preserve message priority and fallback code", () => {
  const confirmation = registrationErrorMessage({
    message: "Error sending confirmation email",
    code: "weak_password",
    status: 429,
  });
  assert.match(confirmation, /^Emailul de confirmare/);
  assert.match(
    registrationErrorMessage({
      message: "",
      code: "email_exists",
      status: 429,
    }),
    /^Există deja/,
  );
  assert.match(
    registrationErrorMessage({
      message: "",
      code: "weak_password",
      status: 429,
    }),
    /^Prea multe/,
  );
  assert.match(
    registrationErrorMessage({ message: "", code: "weak_password" }),
    /^Parola nu/,
  );
  assert.match(
    registrationErrorMessage({ message: "", code: "signup_disabled" }),
    /^Înregistrarea/,
  );
  assert.match(registrationErrorMessage(null), /registration_unavailable/);
  assert.match(
    registrationErrorMessage({ message: "", code: "unknown" }),
    /Cod: unknown\./,
  );
});

test("modal cleanup restores scroll and previous focus in the original order", () => {
  const calls = [];
  const previousDocument = globalThis.document;
  globalThis.document = {
    activeElement: { focus: () => calls.push("focus") },
    body: { style: { overflow: "scroll" } },
  };
  try {
    const restore = openDialog({
      showModal: () => calls.push("open"),
      close: () => calls.push("close"),
    });
    assert.equal(document.body.style.overflow, "hidden");
    restore();
    assert.equal(document.body.style.overflow, "scroll");
    assert.deepEqual(calls, ["open", "close", "focus"]);
  } finally {
    globalThis.document = previousDocument;
  }
});
