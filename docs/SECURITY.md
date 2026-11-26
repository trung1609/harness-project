# Security policy for development

Do not commit secrets or hardcode sensitive configuration. Do not print secret values in logs or reports. Use synthetic values when testing detection. Review dependency and secret scanning tools, their configuration, and limitations before relying on them.

Authentication, authorization, cryptography, sensitive data retention, vulnerability thresholds and deployment controls require approved design and are not yet specified. Record discovered security issues without exposing sensitive values. Do not suppress or weaken checks merely to pass.
