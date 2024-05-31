from django.db import models


class Member(models.Model):
    mentee = models.ForeignKey(
        "users.Mentee", on_delete=models.CASCADE, related_name="memberships"
    )
    team = models.ForeignKey(
        "teams.Team", on_delete=models.CASCADE, related_name="members"
    )
    already_accepted = models.BooleanField(default=False)

    def __str__(self):
        return f"{self.mentee.user.email} in {self.team.name}"

    class Meta:
        indexes = [
            models.Index(fields=["mentee"]),
            models.Index(fields=["team"]),
            models.Index(fields=["already_accepted"]),
        ]
        unique_together = ("mentee", "team")
