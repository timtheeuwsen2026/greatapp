import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export default function SimpleTestInput() {
  const [value, setValue] = useState("");
  const [submitted, setSubmitted] = useState("");

  return (
    <div className="p-6 bg-white rounded-lg shadow-lg max-w-md mx-auto">
      <h3 className="text-lg font-semibold mb-4">Input Test</h3>
      <p className="text-sm text-gray-600 mb-4">
        Current value: "{value}"
      </p>
      <Input
        placeholder="Type something here"
        value={value}
        onChange={(e) => {
          console.log("Input changed:", e.target.value);
          setValue(e.target.value);
        }}
        className="mb-4"
        autoFocus
      />
      <Button 
        onClick={() => {
          console.log("Button clicked, value:", value);
          setSubmitted(value);
          setValue("");
        }}
        className="w-full"
      >
        Submit
      </Button>
      {submitted && (
        <p className="mt-4 text-green-600">
          Submitted: "{submitted}"
        </p>
      )}
    </div>
  );
}