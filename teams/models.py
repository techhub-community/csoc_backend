from django.db import models


class Team(models.Model):
    name = models.CharField(max_length=100)
    mentor = models.ForeignKey(
        "users.Mentor",
        on_delete=models.SET_NULL,
        null=True,
        related_name="mentor_teams",
    )
    mentees = models.ManyToManyField(
        "users.Mentee", through="members.Member", related_name="teams"
    )

    def __str__(self):
        return self.name

    class Meta:
        indexes = [
            models.Index(fields=["name"]),
        ]
