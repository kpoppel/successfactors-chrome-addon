# SF Team Absence Calendar

Chrome/Edge extension (MV3). Resolves a root person and everyone below them in the reporting tree, fetches their absences from SuccessFactors using your own session, and renders an in-browser calendar.

## Use

1. Load `addon-calendar/` as an unpacked extension.
2. Open the extension options: set the SF host, the root person (name or numeric user ID) and the date range (rolling or fixed).
3. Log in to SuccessFactors. If the calendar reports an authorisation error, open the SF Team Absence Calendar once so the extension can capture the `x-ajax-token`.
4. Click the extension icon to open the calendar.

## Notes

- Name lookup uses the `User` OData entity (`defaultFullName`). If it fails for your tenant, enter the user ID.
- Each person found is queried once as a manager (`DIRECT_REPORT`), five requests in parallel.
- Saving the page (Ctrl+S) keeps the rendered grid; the filters need the extension's script and will not work offline.
