# Page snapshot

```yaml
- generic [ref=e2]:
  - generic [ref=e3]:
    - heading "Secure Connection Failed" [level=1] [ref=e5]
    - paragraph [ref=e6]: An error occurred during a connection to app:3000. SSL received a record that exceeded the maximum permissible length.
    - paragraph [ref=e7]: "Error code: SSL_ERROR_RX_RECORD_TOO_LONG"
    - list [ref=e9]:
      - listitem [ref=e10]: The page you are trying to view cannot be shown because the authenticity of the received data could not be verified.
      - listitem [ref=e11]: Please contact the website owners to inform them of this problem.
    - paragraph [ref=e12]:
      - link "Learn more…" [ref=e13] [cursor=pointer]:
        - /url: https://support.mozilla.org/1/firefox/146.0.1/Linux/en-US/connection-not-secure
  - button "Try Again" [active] [ref=e15]
```