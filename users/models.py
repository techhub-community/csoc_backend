from django.contrib.auth.models import AbstractUser, PermissionsMixin
from django.db import models
from django.utils import timezone

from .managers import CustomUserManager


class CustomUser(AbstractUser):
    username = None
    email = models.EmailField(unique=True, db_index=True, null=False)
    is_staff = models.BooleanField(default=False)
    is_active = models.BooleanField(default=True)
    date_joined = models.DateTimeField(default=timezone.now)

    USERNAME_FIELD = "email"
    REQUIRED_FIELDS = []

    objects = CustomUserManager()

    def __str__(self):
        return self.email

    class Meta:
        indexes = [
            models.Index(fields=["email"]),
        ]


class Mentee(models.Model):
    user = models.OneToOneField(CustomUser, on_delete=models.CASCADE)
    program = models.ForeignKey(
        "programs.Program",
        on_delete=models.SET_DEFAULT,
        default=1,
        related_name="mentees",
    )
    team = models.ForeignKey(
        "teams.Team",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="mentee_team",
    )

    def __str__(self):
        return self.user.email


class Mentor(models.Model):
    user = models.OneToOneField(CustomUser, on_delete=models.CASCADE)
    program = models.ForeignKey(
        "programs.Program",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="mentors",
    )
    team = models.ForeignKey(
        "teams.Team",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="mentor_team",
    )

    def __str__(self):
        return self.user.email
