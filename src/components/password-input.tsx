"use client";

import { useState } from "react";
import { Icon } from "@/components/icons";

export function PasswordInput({
  id,
  name,
  placeholder,
  autoComplete,
  className = "",
  required,
}: {
  id?: string;
  name: string;
  placeholder?: string;
  autoComplete?: string;
  className?: string;
  required?: boolean;
}) {
  const [show, setShow] = useState(false);

  return (
    <div className="relative">
      <input
        id={id}
        name={name}
        type={show ? "text" : "password"}
        autoComplete={autoComplete}
        placeholder={placeholder}
        required={required}
        className={`w-full pr-10 ${className}`}
      />
      <button
        type="button"
        onClick={() => setShow(!show)}
        className="absolute inset-y-0 right-0 flex items-center pr-3 text-ink-400 hover:text-ink-600"
        tabIndex={-1}
      >
        <Icon name={show ? "eye-off" : "eye"} size={16} />
      </button>
    </div>
  );
}
