import type { Page } from "@playwright/test";
import { expect } from "@playwright/test";
import { API_BASE } from "./api.js";

const USER_PROFILE_GET = new RegExp(
  `${escapeRegExp(API_BASE)}/users/[a-z0-9]+/?$`,
  "i",
);

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Tracks API/image requests during onboarding photo preview.
 */
export class PreviewPoolNetworkTracker {
  private sawUploadsUserImages = false;
  private userProfileGets: string[] = [];
  private imageContentGets: string[] = [];

  attach(page: Page): void {
    page.on("request", (req) => {
      const url = req.url();
      const method = req.method();
      if (url.includes("/uploads/user-images/")) {
        this.sawUploadsUserImages = true;
      }
      if (method === "GET" && USER_PROFILE_GET.test(url.split("?")[0] ?? url)) {
        this.userProfileGets.push(url);
      }
      if (method === "GET" && /\/images\/[^/]+\/content/.test(url)) {
        this.imageContentGets.push(url);
      }
    });
  }

  assertPreviewPoolContract(): void {
    expect(this.sawUploadsUserImages, "must not load /uploads/user-images/").toBe(
      false,
    );
    expect(
      this.userProfileGets,
      "must not GET /users/:candidateUserId during preview",
    ).toEqual([]);
    expect(
      this.imageContentGets.length,
      "preview cards should load /images/:id/content",
    ).toBeGreaterThan(0);
    for (const url of this.imageContentGets) {
      expect(url).toMatch(/\/images\/[^/]+\/content/);
      expect(url).not.toContain("/uploads/user-images/");
    }
  }
}
