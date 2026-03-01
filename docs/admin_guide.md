# TechHub Admin Guide

Welcome to the TechHub Admin Guide. This document provides information for site administrators managing applications and users within the portal.

## Application Audience Settings

When creating or editing an application link in TechHub, you must configure its **Audience**. This setting acts as a primary access control layer, determining exactly who can see and access the application from the main portal view. 

The portal interface dynamically filters the visible apps based on the current user's authentication state and assigned roles. Users will never see applications they are not authorized to access.

TechHub supports four distinct audience levels:

### 1. Public
* **Visibility:** visible to **anyone** who visits the TechHub URL, regardless of whether they are logged in or not.
* **Use Case:** Ideal for company-wide public resources, links to external public-facing websites, status pages, or general information that does not require an account.

### 2. Authenticated
* **Visibility:** Visible to **any user who has successfully logged in** to TechHub.
* **Use Case:** The standard default for internal company tools, employee directories, or general resources that are safe for any registered employee to access but should not be exposed to the public internet.

### 3. Role-based
* **Visibility:** Visible only to users who have been explicitly assigned a **specific Role** (e.g., `admin`, `hr_team`, `developers`).
* **Configuration:** When this option is selected, a secondary dropdown will appear requiring you to select the specific Role that grants access.
* **Use Case:** Designed for department-specific tools, sensitive administrative dashboards, or specialized applications that only a subset of employees should access.

### 4. Specific Users
* **Visibility:** Visible only to **individual users you explicitly select**.
* **Configuration:** When this option is selected, an autocomplete search field appears, allowing you to search the database by name or email and assign access on a granular, per-user basis.
* **Use Case:** Best suited for highly restricted tools, temporary project dashboards, or apps that are currently in beta testing with a select group of individuals.
