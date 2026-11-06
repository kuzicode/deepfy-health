"use client";

import { useEffect } from "react";
import { authClient } from "@/client/auth-client";
import { clearSignedInMark } from "@/client/signed-in-mark";

export function LogoutRun() {
  useEffect(() => {
    void (async () => {
      try { await authClient.signOut(); } catch { /* 已经没有会话也照样回登录页 */ }
      clearSignedInMark();
      window.location.replace("/login");
    })();
  }, []);
  return null;
}
