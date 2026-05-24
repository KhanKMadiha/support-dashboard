/**
 * Knowledge base catalogue used for keyword matching and suggested responses.
 * Replace or extend this list with your organisation's real documentation.
 */
const DOCUMENTATION = [
  {
    id: "sso-saml-login",
    title: "SSO and SAML login troubleshooting",
    category: "Authentication",
    keywords: ["sso", "saml", "oauth", "login", "sign in", "sign-in", "idp", "identity provider", "federation", "assertion", "metadata"],
    snippet: "Verify IdP metadata, clock skew, and attribute mapping when users cannot authenticate via enterprise SSO.",
    issueTopic: "SSO or SAML login",
    resolutionSteps: [
      "Confirm your Identity Provider metadata is up to date in the admin console.",
      "Check that the clock on your IdP server is synchronised (NTP) to avoid assertion failures.",
      "Verify the email or username sent in the SAML assertion matches the user's account in our system."
    ]
  },
  {
    id: "api-rest-errors",
    title: "REST API error codes and common fixes",
    category: "API",
    keywords: ["api", "rest", "401", "403", "404", "500", "endpoint", "token", "bearer", "rate limit", "webhook", "postman"],
    snippet: "Reference for HTTP status codes, authentication headers, and debugging failed API requests.",
    issueTopic: "API request errors",
    resolutionSteps: [
      "For 401 or 403 errors, confirm you are sending a valid Bearer token in the Authorization header and that it has not expired.",
      "For 404 errors, double-check the endpoint URL and API version in your request.",
      "For 500 errors, share the request ID from the response headers, the endpoint called, and the timestamp (UTC) so we can trace the request."
    ]
  },
  {
    id: "password-reset",
    title: "Password reset and account recovery",
    category: "Account",
    keywords: ["password", "reset", "forgot", "locked", "account", "recovery", "email", "verification", "mfa", "2fa"],
    snippet: "Steps for users who cannot sign in, including MFA recovery and admin-assisted resets.",
    issueTopic: "account access or password recovery",
    resolutionSteps: [
      "Use the \"Forgot password\" link on the login page and check your spam folder for the reset email.",
      "If you use MFA and have lost your device, ask an admin on your account to start MFA recovery from team settings.",
      "If the account is locked after multiple attempts, wait 30 minutes for automatic unlock or contact us to verify your identity."
    ]
  },
  {
    id: "billing-subscription",
    title: "Billing, invoices, and subscription changes",
    category: "Billing",
    keywords: ["billing", "invoice", "payment", "subscription", "plan", "upgrade", "downgrade", "refund", "charge", "stripe"],
    snippet: "How to update payment methods, resolve failed charges, and change subscription tiers.",
    issueTopic: "billing or subscription",
    resolutionSteps: [
      "Update your payment method and download invoices from Settings → Billing.",
      "If a charge failed, update your card details and reply so we can retry the payment.",
      "Plan upgrades take effect immediately; downgrades apply at the end of the current billing period."
    ]
  },
  {
    id: "integrations-zendesk",
    title: "Zendesk and CRM integrations",
    category: "Integrations",
    keywords: ["zendesk", "salesforce", "integration", "sync", "crm", "ticket", "webhook", "connector"],
    snippet: "Setup and troubleshooting for support platform and CRM connectors.",
    issueTopic: "integration or sync",
    resolutionSteps: [
      "Confirm the integration is enabled and API credentials are still valid.",
      "Check that the webhook URL is reachable from your network.",
      "Re-authorise from Integrations → your platform → Reconnect if syncing has stopped."
    ]
  },
  {
    id: "performance-slow",
    title: "Performance issues and timeouts",
    category: "Platform",
    keywords: ["slow", "timeout", "latency", "performance", "loading", "hang", "freeze", "cache", "cdn"],
    snippet: "Diagnose slow page loads, request timeouts, and regional latency problems.",
    issueTopic: "slow performance or timeouts",
    resolutionSteps: [
      "Try a hard refresh (Ctrl+Shift+R or Cmd+Shift+R) to clear cached assets.",
      "Test in a private browser window to rule out extensions or cached data.",
      "If the problem continues, tell us your region, browser version, and which page or action is affected."
    ]
  },
  {
    id: "datadog-monitoring",
    title: "Logs, monitoring, and observability",
    category: "Operations",
    keywords: ["datadog", "logs", "elasticsearch", "monitoring", "alert", "dashboard", "trace", "apm", "pagerduty"],
    snippet: "Using observability tools to investigate incidents and correlate customer-reported errors.",
    issueTopic: "monitoring or observability",
    resolutionSteps: [
      "Note the alert timestamp (UTC), environment, and any trace or request ID from your monitoring tool.",
      "Check your service dashboard for error spikes around the time you noticed the issue.",
      "Share those details with us if you need help correlating customer impact with backend logs."
    ]
  },
  {
    id: "data-export",
    title: "Data export and GDPR requests",
    category: "Compliance",
    keywords: ["export", "gdpr", "privacy", "delete", "data", "retention", "compliance", "dsar"],
    snippet: "Process for data export requests, account deletion, and regulatory compliance workflows.",
    issueTopic: "data export or privacy",
    resolutionSteps: [
      "Submit export or deletion requests from Settings → Privacy.",
      "Allow up to 30 days for export delivery, depending on data volume.",
      "For GDPR or DSAR requests, confirm the account email and the scope of data to export or delete."
    ]
  },
  {
    id: "browser-compat",
    title: "Browser compatibility and extensions",
    category: "Client",
    keywords: ["browser", "chrome", "firefox", "safari", "extension", "adblock", "cookies", "javascript", "devtools"],
    snippet: "Supported browsers, clearing cache/cookies, and ruling out extension conflicts.",
    issueTopic: "browser or client behaviour",
    resolutionSteps: [
      "Use a supported browser: the latest two versions of Chrome, Firefox, Safari, or Edge.",
      "Clear cache and cookies, and temporarily disable extensions.",
      "Ensure JavaScript is enabled; if the issue is browser-specific, share the version and a screenshot."
    ]
  },
  {
    id: "onboarding-setup",
    title: "Initial setup and onboarding",
    category: "Getting started",
    keywords: ["onboarding", "setup", "configure", "installation", "getting started", "first", "welcome", "invite", "provision"],
    snippet: "First-time configuration, user invites, and environment provisioning for new accounts.",
    issueTopic: "setup or onboarding",
    resolutionSteps: [
      "Work through the onboarding checklist in your admin dashboard.",
      "Invite team members and connect integrations from the setup wizard.",
      "If you are blocked on a step, tell us the step number and any error message shown."
    ]
  }
];

const STOP_WORDS = new Set([
  "a", "an", "the", "and", "or", "but", "in", "on", "at", "to", "for", "of", "with",
  "is", "are", "was", "were", "be", "been", "being", "have", "has", "had", "do",
  "does", "did", "will", "would", "could", "should", "may", "might", "must", "shall",
  "can", "please", "thanks", "thank", "hi", "hello", "dear", "regards", "help", "issue", "problem"
]);
