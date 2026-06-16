ALTER TABLE usuarios
  MODIFY rol ENUM('SUPER_ADMIN','OWNER','super_admin','owner','seller','support','viewer') NOT NULL DEFAULT 'owner';
