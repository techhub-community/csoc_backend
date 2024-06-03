from django.contrib.auth.models import AbstractUser, PermissionsMixin
from django.db import models
from django.utils import timezone

from .managers import CustomUserManager


class CustomUser(AbstractUser):
    ROLE_CHOICES = [
        ("mentor", "Mentor"),
        ("mentee", "Mentee"),
    ]
    username = None
    email = models.EmailField(unique=True, db_index=True, null=False)
    is_staff = models.BooleanField(default=False)
    is_active = models.BooleanField(default=True)
    date_joined = models.DateTimeField(default=timezone.now)
    role = models.CharField(max_length=6, choices=ROLE_CHOICES)
    first_name = models.CharField(max_length=100, blank=True, null=True)
    last_name = models.CharField(max_length=100, blank= True, null = True)

    USERNAME_FIELD = "email"
    REQUIRED_FIELDS = []

    objects = CustomUserManager()

    def __str__(self):
        return self.email

    class Meta:
        indexes = [
            models.Index(fields=["email"]),
        ]
