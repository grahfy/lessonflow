"use client";

import { useState, useEffect } from "react";

type CaptchaProblem = {
  question: string;
  answer: number;
};

function generateCaptcha(): CaptchaProblem {
  const operators = ["+", "-"];
  const operator = operators[Math.floor(Math.random() * operators.length)];
  const a = Math.floor(Math.random() * 10) + 1;
  const b = Math.floor(Math.random() * 10) + 1;
  
  let answer: number;
  if (operator === "+") {
    answer = a + b;
  } else {
    answer = Math.max(a, b) - Math.min(a, b);
  }
  
  const question = `${Math.max(a, b)} ${operator} ${Math.min(a, b)} = ?`;
  return { question, answer };
}

export function useCaptcha() {
  const [captcha, setCaptcha] = useState<CaptchaProblem | null>(null);
  const [userAnswer, setUserAnswer] = useState("");
  const [isValid, setIsValid] = useState(false);
  const [isTouched, setIsTouched] = useState(false);
  
  useEffect(() => {
    setCaptcha(generateCaptcha());
  }, []);
  
  function validateAnswer() {
    if (!captcha) return false;
    const userNum = parseInt(userAnswer, 10);
    return userNum === captcha.answer;
  }
  
  function regenerate() {
    setCaptcha(generateCaptcha());
    setUserAnswer("");
    setIsValid(false);
    setIsTouched(false);
  }
  
  function handleChange(value: string) {
    const cleaned = value.replace(/[^0-9-]/g, "");
    setUserAnswer(cleaned);
    setIsTouched(true);
    
    if (!captcha) return;
    const userNum = parseInt(cleaned, 10);
    setIsValid(!isNaN(userNum) && userNum === captcha.answer);
  }
  
  return {
    captcha,
    userAnswer,
    isValid,
    isTouched,
    regenerate,
    validateAnswer,
    handleChange
  };
}
