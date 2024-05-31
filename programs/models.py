from django.db import models


class Program(models.Model):
    description = models.CharField(max_length=128)

    def __str__(self):
        return self.description

    class Meta:
        ordering = ["description"]
