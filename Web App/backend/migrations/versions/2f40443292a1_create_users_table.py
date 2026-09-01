"""create users table

The first migration this project has ever had -- see maze_api/models.py for why
the table looks the way it does. Written against SQLite (the development
default) and Postgres (the deployment target) with nothing engine-specific in
it, so both are built by the same `alembic upgrade head`.

Revision ID: 2f40443292a1
Revises: 
Create Date: 2026-09-01 16:56:38.408549
"""

from alembic import op
import sqlalchemy as sa


revision = '2f40443292a1'
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table('users',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('auth0_sub', sa.String(length=255), nullable=False),
    sa.Column('email', sa.String(length=320), nullable=True),
    sa.Column('name', sa.String(length=255), nullable=True),
    sa.Column('picture', sa.String(length=1024), nullable=True),
    sa.Column('role', sa.String(length=32), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('last_seen_at', sa.DateTime(timezone=True), nullable=False),
    sa.PrimaryKeyConstraint('id')
    )
    with op.batch_alter_table('users', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_users_auth0_sub'), ['auth0_sub'], unique=True)
        batch_op.create_index(batch_op.f('ix_users_email'), ['email'], unique=False)



def downgrade() -> None:
    with op.batch_alter_table('users', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_users_email'))
        batch_op.drop_index(batch_op.f('ix_users_auth0_sub'))

    op.drop_table('users')
