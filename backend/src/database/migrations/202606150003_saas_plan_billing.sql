ALTER TABLE empresas
  MODIFY plan ENUM('BASICO','PRO','STARTER','BUSINESS','ENTERPRISE') NOT NULL DEFAULT 'STARTER';

CREATE TABLE IF NOT EXISTS subscriptions (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  empresa_id BIGINT UNSIGNED NOT NULL,
  plan VARCHAR(40) NOT NULL,
  status ENUM('TRIALING','ACTIVE','PAST_DUE','CANCELED','SUSPENDED') NOT NULL DEFAULT 'ACTIVE',
  provider VARCHAR(80) NULL,
  provider_customer_id VARCHAR(160) NULL,
  provider_subscription_id VARCHAR(160) NULL,
  current_period_start DATETIME NULL,
  current_period_end DATETIME NULL,
  cancel_at_period_end TINYINT(1) NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY subscriptions_empresa_id_index (empresa_id),
  KEY subscriptions_status_index (status),
  CONSTRAINT subscriptions_empresa_id_foreign
    FOREIGN KEY (empresa_id) REFERENCES empresas (id)
    ON DELETE CASCADE
    ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS subscription_invoices (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  subscription_id BIGINT UNSIGNED NOT NULL,
  empresa_id BIGINT UNSIGNED NOT NULL,
  provider_invoice_id VARCHAR(160) NULL,
  amount_cents INT UNSIGNED NOT NULL DEFAULT 0,
  currency VARCHAR(8) NOT NULL DEFAULT 'MXN',
  status ENUM('DRAFT','OPEN','PAID','VOID','UNCOLLECTIBLE') NOT NULL DEFAULT 'DRAFT',
  hosted_invoice_url VARCHAR(255) NULL,
  due_at DATETIME NULL,
  paid_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY subscription_invoices_subscription_index (subscription_id),
  KEY subscription_invoices_empresa_index (empresa_id),
  CONSTRAINT subscription_invoices_subscription_foreign
    FOREIGN KEY (subscription_id) REFERENCES subscriptions (id)
    ON DELETE CASCADE
    ON UPDATE CASCADE,
  CONSTRAINT subscription_invoices_empresa_foreign
    FOREIGN KEY (empresa_id) REFERENCES empresas (id)
    ON DELETE CASCADE
    ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
